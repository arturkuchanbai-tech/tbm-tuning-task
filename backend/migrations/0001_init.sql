CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

CREATE TABLE user_vouchers (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),

    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (name) VALUES
    ('Artur'),
    ('Alex'),
    ('John');


INSERT INTO products (name) VALUES
    ('Coffee Voucher'),
    ('Pizza Voucher'),
    ('Cinema Voucher');


INSERT INTO user_vouchers (user_id, product_id, quantity)
SELECT
    users.id,
    products.id,
    CASE products.name
        WHEN 'Coffee Voucher' THEN 5
        WHEN 'Pizza Voucher' THEN 2
        WHEN 'Cinema Voucher' THEN 1
    END
FROM users
CROSS JOIN products;