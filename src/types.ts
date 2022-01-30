export type ID = number | string

export type Pagination<T> = {
  has_more: boolean | null
  before: string
  after: string
  data: T[]
}

export interface Workspace {
  id: ID
  object: 'workspace'
  name: string
  photo_url: string
  owner_id: ID
  deleted: boolean
}

export interface Board {
  id: ID
  object: 'board'
  name: string
  sort_order: string
  color: string
  description: string
  og_image: string | null
  user_ids: ID[]
  deleted: boolean
}

export interface Table {
  id: ID
  object: 'folder'
  name: string
  sort_order: string
  color: null
  attribute_ids: ID[]
  deleted: boolean
}

export interface User {
  id: ID
  object: 'user'
  name: string
  email: string
  photo_url: string | null
  created_at: string
  job: string
  location: string
  tagline: string | null
  is_developer: true
  deleted: boolean
}

export interface Attribute {
  id: ID
  object: 'attribute'
  name: string
  type: AttributeType
  created_at: string
  deleted: boolean
  settings?: any
  default_data: any
}

export interface ItemValue {
  id: ID
  object: 'value'
  data: string
  attribute_id: ID
  attribute?: Attribute
  deleted: boolean
}

export interface Item {
  id: ID
  object: 'item'
  folder_id: ID
  created_at: string
  sort_order: string
  deleted: false
  values?: ItemValue[]
}

export type ItemExpand = 'values' | 'values.attribute' | 'created_by' | 'folder'

export interface Folder {
  id: ID
  object: 'folder'
  name: string
  sort_order: string
  color: string | null
  attribute_ids: ID[]
  deleted: false
}

export type AttributeType =
  | 'attachments'
  | 'checkbox'
  | 'checklist'
  | 'created_at'
  | 'created_by'
  | 'date'
  | 'email'
  | 'label'
  | 'links'
  | 'longtext'
  | 'members'
  | 'number'
  | 'phone'
  | 'progress'
  | 'rating'
  | 'source_folder'
  | 'text'
  | 'updated_at'
  | 'vote'
  | 'reference'

export interface AttributeLabel {
  id: ID
  name: string
  color: string | null
}
