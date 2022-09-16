import {Command, Config, Flags} from '@oclif/core'
import * as fs from 'node:fs/promises'
import * as CliProgress from 'cli-progress'
import Utils from '../utils'
import path = require('node:path')
// import * as inquirer from 'inquirer'
import fetch, {RequestInit} from 'node-fetch'

const inquirer = require('inquirer')
/**
 * TODO: 区分普通下载与 hls 下载时路径不不同
 * TODO: 下载进度显示
 * TODO: 下载过程信息展示
 */

export default class Download extends Command {
  static description = 'download specify hls file';

  static examples = ['mycli download https://example.com/test.m3u8 -p [your path] -n [rename file]'];

  static flags = {
    // flag with a value (-n, --name=VALUE)
    path: Flags.string({char: 'p', description: 'path to storage'}),
    // name: Flags.string({char: 'n', description: 'name of file to rename', required: true}),
  };

  static args = [{name: 'url', description: 'URL to download', require: true}];

  private m3u8Regex = /\.m3u8/i
  private storagePath = Utils.getDefaultStoragePath()
  private bar = new CliProgress.SingleBar({}, CliProgress.Presets.shades_classic)
  private defaultOptions: RequestInit = {}

  private async m3u8Download(url: string) {
    const res = await fetch(url, this.defaultOptions)
    const playlist = await res.text()
    const isMaster = !(playlist.indexOf('#EXTINF:') > 0 && playlist.indexOf('#EXT-X-TARGETDURATION:') > 0)

    const lines = playlist.split('\n')
    const prefix = url.match(/(.+)\//)![0]
    const dirname = url.match(/[^/]+(?=\.m3u8)/gi)![0]

    const curPath = path.resolve(this.storagePath, dirname)

    const exist = await Utils.directoryExist(curPath)
    if (exist) {
      const prompt = inquirer.createPromptModule()
      const result = await prompt({
        type: 'confirm',
        name: 'replace',
        message: 'confirm to replace exist directory ?',
      })
      if (!result.replace.confirm) {
        return
      }

      await fs.rm(curPath, {
        force: true,
        recursive: true,
      })
    }

    await fs.mkdir(curPath)
    await fs.appendFile(path.resolve(curPath, dirname + '.m3u8'), playlist)

    if (isMaster) {
      const resolutions = []
      const urls = []
      for (const line of lines) {
        if (line.indexOf('#EXT-X-STREAM-INF') > 0) {
          console.log(line)
          resolutions.push(line.match(/resolution=\d*x\d*/i)![0])
        } else if (line.indexOf('.m3u8')) {
          urls.push(path.resolve(prefix, line))
        }
      }

      console.log('resolutions', resolutions)
      const prompt = inquirer.createPromptModule()
      const result = await prompt({
        type: 'rawlist',
        name: 'resolution',
        message: 'which resolution to download',
        choices: resolutions.map((value, idx) => ({name: value, value: idx})),
      })

      this.m3u8Download(result.resolution.value)
    } else {
      const tasks = []
      for (const line of lines) {
        if (line.indexOf('.ts') > 0) {
          tasks.push(() => this.normalDownload(this.storagePath, line))
        }
      }

      await Promise.all(tasks)
      this.log('download finished')
    }
  }

  private async normalDownload(dir: string, url: string) {
    const [floder] = url.split('/')
    const res = await fetch(url, this.defaultOptions)
    await fs.mkdir(path.resolve(dir, floder))
    const handle = await fs.open(path.resolve(dir, url), 'w')
    const writer = handle.createWriteStream()
    res.body?.pipe(writer)
    // http.get(url, this.defaultHeader, res => {
    //   const {statusCode}  = res
    //   if (statusCode !== 200) {
    //     res.resume()
    //     this.error(`download [${url}] error: statusCode: ${statusCode}`)
    //   }

    //   const wStream = fs.createWriteStream(path.resolve(dir, name))

    //   res.on('data', chunk => {
    //     wStream.write(chunk)
    //   })

    //   res.on('end', () => {
    //     wStream.close()
    //   })
    // })
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Download)

    if (flags.path) {
      const dirname = path.resolve(flags.path)
      const stats = await fs.stat(dirname)
      if (!stats.isDirectory()) {
        this.error('path must be a directory')
      }

      this.storagePath = dirname
    }

    if (!args.url) {
      this.error('you must specify a url to download')
    }

    if (this.m3u8Regex.test(args.url)) {
      this.m3u8Download(args.url)
    } else {
      this.normalDownload(this.storagePath, args.url)
    }
  }
}
