import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

// eslint-disable-next-line unicorn/no-static-only-class
export default class Utils {
  static  getDefaultStoragePath(): string {
    return path.resolve(os.homedir(), 'Downloads/')
  }

  static async fileExist(path: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path)
      return stat.isFile()
    } catch {
      return false
    }
  }

  static async directoryExist(path: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path)
      return stat.isDirectory()
    } catch {
      return false
    }
  }
}
