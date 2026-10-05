import { useEffect, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:3000/api'

type User = {
  id: string
  name: string
}

type Voucher = {
  product_id: string
  product_name: string
  quantity: number
}

type Activation = {
  id: string
  product_name: string
  activated_at: string
}

function App() {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [activations, setActivations] = useState<Activation[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>({})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(`${API_URL}/users`)

      if (!response.ok) {
        throw new Error('Не удалось загрузить пользователей')
      }

      const data: User[] = await response.json()
      setUsers(data)

      if (data.length > 0) {
        selectUser(data[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  async function selectUser(user: User) {
    setSelectedUser(user)
    setMessage('')
    setError('')
    await Promise.all([
      loadVouchers(user.id),
      loadActivations(user.id),
    ])
  }

  async function loadVouchers(userId: string) {
    try {
      const response = await fetch(`${API_URL}/users/${userId}/vouchers`)

      if (!response.ok) {
        throw new Error('Не удалось загрузить ваучеры')
      }

      const data: Voucher[] = await response.json()
      setVouchers(data)

      const initialQuantities: Record<string, string> = {}

      data.forEach((voucher) => {
        initialQuantities[voucher.product_id] = String(voucher.quantity)
      })

      setQuantities(initialQuantities)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    }
  }

  async function loadActivations(userId: string) {
    try {
      const response = await fetch(`${API_URL}/users/${userId}/activations`)

      if (!response.ok) {
        throw new Error('Не удалось загрузить историю')
      }

      const data: Activation[] = await response.json()
      setActivations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    }
  }

  async function activateVoucher(productId: string) {
    if (!selectedUser) return

    try {
      setError('')
      setMessage('')

      const response = await fetch(
        `${API_URL}/users/${selectedUser.id}/products/${productId}/activate`,
        {
          method: 'POST',
        },
      )

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Не удалось активировать ваучер')
      }

      setMessage('Ваучер успешно активирован')

      await Promise.all([
        loadVouchers(selectedUser.id),
        loadActivations(selectedUser.id),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    }
  }

  async function updateVoucher(voucher: Voucher) {
    if (!selectedUser) return

    const value = Number(quantities[voucher.product_id])

    if (!Number.isInteger(value) || value < 0) {
      setError('Количество должно быть целым числом от 0')
      return
    }

    try {
      setError('')
      setMessage('')

      const response = await fetch(
        `${API_URL}/users/${selectedUser.id}/products/${voucher.product_id}/vouchers`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            quantity: value,
          }),
        },
      )

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Не удалось изменить количество')
      }

      setMessage('Количество ваучеров обновлено')
      await loadVouchers(selectedUser.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Voucher Manager</h1>
          <p>Управление ваучерами пользователей</p>
        </div>

        <div className="status">
          <span className="status-dot"></span>
          API connected
        </div>
      </header>

      <main className="container">
        {loading && <div className="loading">Загрузка...</div>}

        {error && (
          <div className="alert error">
            {error}
          </div>
        )}

        {message && (
          <div className="alert success">
            {message}
          </div>
        )}

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Пользователи</h2>
              <p>Выберите пользователя для управления ваучерами</p>
            </div>
          </div>

          <div className="users">
            {users.map((user) => (
              <button
                key={user.id}
                className={`user-card ${
                  selectedUser?.id === user.id ? 'selected' : ''
                }`}
                onClick={() => selectUser(user)}
              >
                <div className="avatar">
                  {user.name.charAt(0).toUpperCase()}
                </div>

                <div className="user-info">
                  <strong>{user.name}</strong>
                  <span>{user.id}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {selectedUser && (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Ваучеры</h2>
                  <p>
                    Пользователь: <strong>{selectedUser.name}</strong>
                  </p>
                </div>
              </div>

              <div className="voucher-grid">
                {vouchers.map((voucher) => (
                  <div className="voucher-card" key={voucher.product_id}>
                    <div className="voucher-icon">
                      🎟️
                    </div>

                    <div className="voucher-content">
                      <h3>{voucher.product_name}</h3>

                      <div className="quantity">
                        <span>Доступно</span>
                        <strong>{voucher.quantity}</strong>
                      </div>

                      <button
                        className="primary-button"
                        disabled={voucher.quantity === 0}
                        onClick={() =>
                          activateVoucher(voucher.product_id)
                        }
                      >
                        {voucher.quantity === 0
                          ? 'Нет ваучеров'
                          : 'Активировать'}
                      </button>

                      <div className="update-row">
                        <input
                          type="number"
                          min="0"
                          value={quantities[voucher.product_id] ?? ''}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [voucher.product_id]: event.target.value,
                            }))
                          }
                        />

                        <button
                          className="secondary-button"
                          onClick={() => updateVoucher(voucher)}
                        >
                          Сохранить
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {vouchers.length === 0 && (
                  <div className="empty">
                    У пользователя пока нет ваучеров
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>История активаций</h2>
                  <p>Последние использованные ваучеры</p>
                </div>
              </div>

              {activations.length > 0 ? (
                <div className="history">
                  {activations.map((activation) => (
                    <div className="history-item" key={activation.id}>
                      <div className="history-icon">✓</div>

                      <div className="history-info">
                        <strong>{activation.product_name}</strong>
                        <span>
                          {new Date(
                            activation.activated_at,
                          ).toLocaleString('ru-RU')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  Активаций пока нет
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App