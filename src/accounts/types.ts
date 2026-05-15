export interface Account {
  id: string
  name: string
  type: 'checking' | 'credit_card'
  closeDay: number | null
  dueDay: number | null
  createdAt: number
  updatedAt: number
}
