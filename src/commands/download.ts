import {Command, Flags} from '@oclif/core'
import * as fs from 'node:fs/promises'
import * as CliProgress from 'cli-progress'
import Utils from '../utils'
import path = require('node:path')
import fetch, {RequestInit} from 'node-fetch'

const inquirer = require('inquirer')
const ps = path.resolve

/**
 * TODO: 区分普通下载与 hls 下载时路径不不同
 * TODO: 下载进度显示
 * TODO: 下载过程信息提示/展示
 * TODO: 存储权限判断
 * TODO: 存储原子性
 * */

export default class Download extends Command {
  static description = 'download specify hls file';

  static examples = ['mycli download https://example.com/test.m3u8 -p [your path] -n [rename file]'];

  static flags = {
    // flag with a value (-n, --name=VALUE)
    path: Flags.string({char: 'p', description: 'path to storage'}),
  };

  static args = [{name: 'url', description: 'URL to download', require: true}];

  private m3u8Regex = /\.m3u8/i
  private storagePath = Utils.getDefaultStoragePath()
  private bar = new CliProgress.SingleBar({}, CliProgress.Presets.shades_classic)
  private defaultOptions: RequestInit = {}

  private getStaticInfo(url: string) {
    const slices = url.split('/')
    // url = https://www.example.com/a/b/c.m3u8
    const prefix = slices.slice(0, -1).join('/') + '/' // https://www.example.com/a/b/
    const dirname = slices[slices.length - 2] // b
    const filename = slices[slices.length - 1] // c
    return {prefix, dirname, filename}
  }

  private async m3u8Download(url: string) {
    console.log('url', url)
    const res = await fetch(url, this.defaultOptions)
    const playlist = await res.text()
    const isMaster = !(playlist.indexOf('#EXTINF:') > 0 && playlist.indexOf('#EXT-X-TARGETDURATION:') > 0)

    const lines = playlist.split('\n')
    const {prefix, dirname, filename} = this.getStaticInfo(url)
    console.log('dirname', dirname)
    this.storagePath = ps(this.storagePath, dirname)
    const targetPath = this.storagePath
    console.log('targetPath', targetPath)
    const exist = await Utils.directoryExist(targetPath)
    if (exist) {
      const prompt = inquirer.createPromptModule()
      const result = await prompt({
        type: 'confirm',
        name: 'replace',
        message: 'confirm to replace exist directory ?',
      })
      console.log('conform', result)
      if (!result.replace) {
        return
      }

      await fs.rm(targetPath, {
        force: true,
        recursive: true,
      })
    }

    await fs.mkdir(targetPath)
    await fs.appendFile(ps(targetPath, filename), playlist)

    if (isMaster) {
      const resolutions = []
      const urls = []
      console.log('isMaster', isMaster)
      for (const line of lines) {
        console.log('line', line)
        if (line.includes('#EXT-X-STREAM-INF')) {
          console.log(line)
          resolutions.push(line.match(/resolution=\d*x\d*/i)![0])
        } else if (line.includes('.m3u8')) {
          urls.push(prefix + line)
        }
      }

      console.log('resolutions', resolutions)
      console.log('urls', urls)
      const prompt = inquirer.createPromptModule()
      const result = await prompt({
        type: 'rawlist',
        name: 'resolution',
        message: 'which resolution to download',
        choices: resolutions.map((value, idx) => ({name: value, value: idx})),
      })
      console.log('result', result)
      this.m3u8Download(urls[result.resolution])
    } else {
      const tasks = []
      for (const line of lines) {
        if (line.includes('.ts')) {
          console.log('line', line)
          tasks.push(new Promise((resolve, reject) => {
            this.normalDownload(prefix + line).then(resolve, reject)
          }))
        }
      }

      console.log('tasks', tasks.length)
      await Promise.all(tasks)
      this.log('download finished')
    }
  }

  private async normalDownload(url: string) {
    const {dirname, filename} = this.getStaticInfo(url)
    const res = await fetch(url, this.defaultOptions)
    const curPath = ps(this.storagePath, dirname)
    await fs.mkdir(curPath)
    const handle = await fs.open(ps(curPath, filename), 'w')
    const writer = handle.createWriteStream()
    res.body?.pipe(writer)
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
      this.normalDownload(args.url)
    }
  }
}
