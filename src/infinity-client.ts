import axios, { AxiosInstance } from 'axios'
import rateLimit from 'axios-rate-limit'
import axiosRetry from 'axios-retry'

import Debug from 'debug'
import {
  Workspace,
  ID,
  Pagination,
  Board,
  Item,
  ItemExpand,
  Attribute,
  Folder,
  AttributeType,
} from './infinity-types'
import { first, isEmpty } from 'lodash'

const MAX_REQUESTS_PER_MINUTE = 180

const DEFAULT_ITEM_EXPANDS: ItemExpand[] = [
  'created_by',
  'folder',
  'values',
  'values.attribute',
]

const BASE_URL = 'https://app.startinfinity.com/api/v2'

export interface InfinityOptions {
  /** If not specified, use process.env.INFINITY_TOKEN */
  token?: string
  /** If not specified, use process.env.INFINITY_WORKSPACE_ID */
  workspaceId?: string
  /** If not specified, use process.env.INFINITY_BOARD_ID */
  boardId?: string
}

export class InfinityClient {
  private readonly client: AxiosInstance
  private debug = Debug(`infinity`)

  private attributes: Pagination<Attribute> | null = null
  private boards: Pagination<Board> | null = null
  private folders: Pagination<Folder> | null = null
  private folderItems: Record<string, Folder> = {}
  private foldersByName: Record<string, Folder> = {}

  private board: ID
  private workspace: ID

  constructor(infinityOptions: InfinityOptions) {
    const token = infinityOptions.token || process.env.INFINITY_TOKEN
    const workspaceId =
      infinityOptions.workspaceId || process.env.INFINITY_WORKSPACE_ID
    const boardId = infinityOptions.boardId || process.env.INFINITY_BOARD_ID

    if (!(token && workspaceId && boardId)) {
      throw new Error(`token, workspaceId, boardId are missing`)
    }

    let client = axios.create({
      baseURL: BASE_URL,
    })

    client.defaults.headers.common = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    // Apply axios-rate-limit
    client = rateLimit(client, {
      maxRequests: MAX_REQUESTS_PER_MINUTE,
      perMilliseconds: 60 * 1000, // per minute
    })

    // Apply axios-retry
    axiosRetry(client, { retries: 3 })

    this.client = client
    this.board = boardId
    this.workspace = workspaceId
  }

  async listAttributes(params?: { limit?: number; after?: string }) {
    if (!isEmpty(this.attributes)) return this.attributes

    const { workspace, board } = this

    const { data } = await this.client.get<Pagination<Attribute>>(
      `/workspaces/${workspace}/boards/${board}/attributes`,
      {
        params: {
          limit: 100,
          ...params,
        },
      },
    )

    this.attributes = data

    return data
  }

  async listAllAttributes() {
    // TODO: Support more than 100 items

    return (await this.listAttributes({ limit: 100 }))?.data
  }

  async findAttributeByName(name: string) {
    const attributes = await this.listAttributes({ limit: 100 })

    return attributes?.data.find((attribute) => attribute.name === name) ?? null
  }

  async createAttribute(attribute: {
    name: string
    type: AttributeType
    default_data?: any
    settings?: any
  }) {
    const { workspace, board } = this

    const d = this.debug.extend(this.createAttribute.name)

    d(`start creating new attribute`, attribute)

    try {
      const { data } = await this.client.post<Attribute>(
        `/workspaces/${workspace}/boards/${board}/attributes`,
        { default_data: '', settings: {}, ...attribute },
      )

      d(`created attribute successfully`, attribute)

      return data
    } catch (error) {
      throw error
    }
  }

  async listBoards(params?: { limit?: number }) {
    if (!isEmpty(this.boards)) return this.boards

    const { workspace } = this

    try {
      const { data } = await this.client.get<Pagination<Board>>(
        `/workspaces/${workspace}/boards`,
        { params },
      )

      this.boards = data

      return data
    } catch (error) {
      console.log(error)
      throw error
    }
  }

  async listFolders(params?: { limit?: number }) {
    if (!isEmpty(this.folders)) return this.folders

    const { workspace, board } = this

    try {
      const { data } = await this.client.get<Pagination<Folder>>(
        `/workspaces/${workspace}/boards/${board}/folders`,
        { params },
      )

      this.folders = data

      return data
    } catch (error) {
      console.log(error)
      throw error
    }
  }

  async listAllFolders() {
    // TODO: Support more than 100 folders.

    const getFolders = async () =>
      (await this.listFolders({ limit: 100 }))?.data

    return getFolders()
  }

  async findFolderByName(name: string) {
    // Get from cache
    if (!isEmpty(this.foldersByName[name])) return this.foldersByName[name]

    const folders = await this.listAllFolders()

    const folder = folders?.find((f) => f.name === name)

    if (!isEmpty(folder)) {
      this.foldersByName[name] = folder!
    }

    return folder ?? null
  }

  async getFolder(folderId: ID) {
    if (!isEmpty(this.folderItems[folderId])) return this.folderItems[folderId]

    const { workspace, board } = this

    const { data } = await this.client.get<Folder | null>(
      `/workspaces/${workspace}/boards/${board}/folders/${folderId}`,
    )

    if (!isEmpty(data)) this.folderItems[folderId] = data!

    return data ?? null
  }

  async createFolder(params: {
    name: string
    color?: string
    parent_id?: string
    attribute_ids?: string[]
  }) {
    const { workspace, board } = this

    const { data } = await this.client.post<Folder>(
      `/workspaces/${workspace}/boards/${board}/folders`,
      params,
    )

    // Update folder cache
    this.folders = null as any
    this.folderItems[data.id] = data
    this.foldersByName[data.name] = data

    return data
  }

  async duplicateFolder({
    skeletonFolderId: fromFolderId,
    newFolderName,
    parentId,
  }: {
    skeletonFolderId: ID
    newFolderName: string
    parentId: ID
  }) {
    const skeletonFolder = await this.getFolder(fromFolderId)

    if (!skeletonFolder) {
      throw new Error('skeletonFolder does not exist')
    }

    const newFolder = await this.createFolder({
      name: newFolderName,
      attribute_ids: skeletonFolder.attribute_ids as string[],
      parent_id: parentId as string,
    })

    return newFolder
  }

  async listItems(params?: {
    limit?: number
    expand?: ItemExpand[]
    q?: string
    folder_id?: ID
    after?: string
  }) {
    const { workspace, board } = this

    try {
      const { data } = await this.client.get<Pagination<Item>>(
        `/workspaces/${workspace}/boards/${board}/items`,
        {
          params: {
            expand: DEFAULT_ITEM_EXPANDS,
            ...params,
          },
        },
      )

      return data
    } catch (error) {
      console.log(error)
      throw error
    }
  }

  async findOneItem(
    q: string,
    options?: { expand?: ItemExpand[]; q?: string; folder_id?: ID },
  ) {
    const { data: items } = await this.listItems({
      q,
      expand: DEFAULT_ITEM_EXPANDS,
      ...options,
    })

    return first(items) || null
  }

  async createItem(params: {
    folder_id: ID
    values: {
      attribute_id: ID
      data: string
    }[]
  }) {
    try {
      const { workspace, board } = this

      const { data } = await this.client.post<Item>(
        `/workspaces/${workspace}/boards/${board}/items`,
        params,
      )

      return data
    } catch (error) {
      throw error
    }
  }

  async getItem({
    item,
    expand = DEFAULT_ITEM_EXPANDS,
  }: {
    item: ID
    expand?: ItemExpand[]
  }): Promise<Item | null> {
    const { workspace, board } = this

    try {
      const { data } = await this.client.get<Item | null>(
        `/workspaces/${workspace}/boards/${board}/items/${item}`,
        {
          params: {
            expand,
          },
        },
      )

      return data
    } catch (error) {
      throw error
    }
  }

  async updateItem(
    { item }: { item: ID },
    params: {
      folder_id: ID
      values: {
        attribute_id: ID
        data: string
      }[]
    },
  ) {
    try {
      const { workspace, board } = this

      const { data } = await this.client.put<Item>(
        `/workspaces/${workspace}/boards/${board}/items/${item}`,
        params,
      )

      return data
    } catch (error) {
      throw error
    }
  }

  async listWorkspaces({ limit }: { limit?: number }) {
    try {
      const { data } = await this.client.get<Pagination<Workspace>>(
        `/workspaces`,
        {
          params: { limit },
        },
      )

      return data
    } catch (error) {
      this.debug.extend(this.listWorkspaces.name)((error as any)?.data)
      throw error
    }
  }
}
