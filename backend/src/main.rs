use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};

use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, FromRow, PgPool};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
struct User {
    id: Uuid,
    name: String,
}

#[derive(Debug, Serialize, FromRow)]
struct Voucher {
    product_id: Uuid,
    product_name: String,
    quantity: i32,
}

#[derive(Debug, Serialize, FromRow)]
struct Activation {
    id: Uuid,
    product_name: String,
    activated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct UpdateVoucher {
    quantity: i32,
}

async fn get_users(
    State(pool): State<PgPool>,
) -> Result<Json<Vec<User>>, (StatusCode, String)> {
    let users = sqlx::query_as::<_, User>(
        r#"
        SELECT id, name
        FROM users
        ORDER BY name
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(internal_error)?;

    Ok(Json(users))
}

async fn get_user_vouchers(
    State(pool): State<PgPool>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Vec<Voucher>>, (StatusCode, String)> {
    let vouchers = sqlx::query_as::<_, Voucher>(
        r#"
        SELECT
            p.id AS product_id,
            p.name AS product_name,
            uv.quantity
        FROM user_vouchers uv
        JOIN products p ON p.id = uv.product_id
        WHERE uv.user_id = $1
        ORDER BY p.name
        "#,
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await
    .map_err(internal_error)?;

    Ok(Json(vouchers))
}

async fn get_user_activations(
    State(pool): State<PgPool>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Vec<Activation>>, (StatusCode, String)> {
    let activations = sqlx::query_as::<_, Activation>(
        r#"
        SELECT
            a.id,
            p.name AS product_name,
            a.activated_at
        FROM activations a
        JOIN products p ON p.id = a.product_id
        WHERE a.user_id = $1
        ORDER BY a.activated_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await
    .map_err(internal_error)?;

    Ok(Json(activations))
}

async fn activate_voucher(
    State(pool): State<PgPool>,
    Path((user_id, product_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Activation>, (StatusCode, String)> {
    let mut transaction = pool.begin().await.map_err(internal_error)?;

    let result = sqlx::query(
        r#"
        UPDATE user_vouchers
        SET quantity = quantity - 1
        WHERE user_id = $1
          AND product_id = $2
          AND quantity > 0
        "#,
    )
    .bind(user_id)
    .bind(product_id)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::CONFLICT,
            "No vouchers left".to_string(),
        ));
    }

    let activation = sqlx::query_as::<_, Activation>(
        r#"
        INSERT INTO activations (
            id,
            user_id,
            product_id,
            activated_at
        )
        SELECT
            $1,
            $2,
            $3,
            NOW()
        RETURNING
            id,
            (
                SELECT name
                FROM products
                WHERE id = $3
            ) AS product_name,
            activated_at
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(product_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(internal_error)?;

    transaction.commit().await.map_err(internal_error)?;

    Ok(Json(activation))
}

async fn update_voucher(
    State(pool): State<PgPool>,
    Path((user_id, product_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateVoucher>,
) -> Result<Json<Voucher>, (StatusCode, String)> {
    if payload.quantity < 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Quantity cannot be negative".to_string(),
        ));
    }

    let voucher = sqlx::query_as::<_, Voucher>(
        r#"
        UPDATE user_vouchers uv
        SET quantity = $1
        FROM products p
        WHERE uv.user_id = $2
          AND uv.product_id = $3
          AND p.id = uv.product_id
        RETURNING
            p.id AS product_id,
            p.name AS product_name,
            uv.quantity
        "#,
    )
    .bind(payload.quantity)
    .bind(user_id)
    .bind(product_id)
    .fetch_optional(&pool)
    .await
    .map_err(internal_error)?;

    match voucher {
        Some(voucher) => Ok(Json(voucher)),
        None => Err((
            StatusCode::NOT_FOUND,
            "Voucher not found".to_string(),
        )),
    }
}

fn internal_error<E: std::fmt::Display>(
    error: E,
) -> (StatusCode, String) {
    eprintln!("Internal error: {error}");

    (
        StatusCode::INTERNAL_SERVER_ERROR,
        error.to_string(),
    )
}

#[tokio::main]
async fn main() {
    dotenv().ok();

    let database_url =
        std::env::var("DATABASE_URL")
            .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("Failed to connect to PostgreSQL");

    println!("Connected to PostgreSQL!");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    println!("Migrations completed!");

    let app = Router::new()
        .route("/api/users", get(get_users))
        .route(
            "/api/users/{id}/vouchers",
            get(get_user_vouchers),
        )
        .route(
            "/api/users/{id}/activations",
            get(get_user_activations),
        )
        .route(
            "/api/users/{user_id}/products/{product_id}/activate",
            post(activate_voucher),
        )
        .route(
            "/api/users/{user_id}/products/{product_id}/vouchers",
            put(update_voucher),
        )
        .layer(CorsLayer::permissive())
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind(
        "0.0.0.0:3000",
    )
    .await
    .expect("Failed to bind port 3000");

    println!(
        "Server running on http://localhost:3000"
    );

    axum::serve(listener, app)
        .await
        .expect("Server error");
}