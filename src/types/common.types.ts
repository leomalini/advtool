export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  role: 'admin' | 'attorney'
  /** OAB registration number — null for non-attorney profiles. */
  oab_number: string | null
  created_at: string
}
