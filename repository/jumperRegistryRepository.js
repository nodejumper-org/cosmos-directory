import git from 'isomorphic-git'
import * as http from 'isomorphic-git/http/node/index.cjs'
import fs from 'fs'
import path, {join} from 'path'
import _ from 'lodash'
import Bugsnag from '@bugsnag/js'
import {createAgent, timeStamp} from '../utils.js'
import got from 'got';

function JumperRegistryRepository(client, url, branch, opts) {
  opts = opts || {}
  const name = 'chain-registry'
  const repoDir = join(process.cwd(), '../' + name)
  const repoPathMainnet = repoDir
  const repoPathTestnet = join(repoDir, 'testnets')
  const exclude = opts.exclude || []
  const agent = createAgent()
  const gotOpts = {
    timeout: {request: 5000},
    retry: {limit: 3},
    agent: agent
  }

  async function updateRepo() {
    if (fs.existsSync(repoDir)) fs.rmSync(repoDir, {recursive: true})
    await git.clone({
      fs,
      http,
      dir: repoDir,
      ref: branch,
      url: url,
      depth: 1,
      singleBranch: true,
      skipCheckout: true
    })
    await git.fetch({fs, http, dir: repoDir, ref: branch, singleBranch: true});
    await git.checkout({fs, dir: repoDir, ref: branch, force: true});
  }

  async function latestCommit(count) {
    let commits = await git.log({
      fs,
      dir: repoDir,
      ref: `origin/${branch}`,
      depth: count || 1,
    })
    return !count || count === 1 ? commits[0] : commits
  }

  function buildData(dir, repoPath) {
    const jsonFiles = fs.readdirSync(join(repoPath, dir)).filter(file => path.extname(file) === '.json');
    const data = jsonFiles.reduce((sum, filename) => {
      const path = join(repoPath, dir, filename);
      const data = fs.existsSync(path) ? fs.readFileSync(path) : undefined
      const json = data && JSON.parse(data);
      sum[filename.replace(/\.[^.]*$/, '')] = json
      return sum
    }, {})
    return {
      path: dir,
      ...data
    };
  }

  async function refresh() {
    try {
      timeStamp('Updating repository', name);
      await updateRepo();
      await loadData();
    } catch (error) {
      Bugsnag.notify(error, function (event) {
        event.context = name
      })
      timeStamp('Failed to update', name, error);
    }
  }

  async function loadData() {
    const supportedChains = await got.get('https://raw.githubusercontent.com/nodejumper-org/jumper-assets/master/chains.json', gotOpts).json()
    const supportedChainNames = supportedChains
      .map(chain => chain.chain_name);
    console.log('Fetching data from jumper-registry. Supported chains: ', supportedChainNames)

    const chainPaths = supportedChains.map(chain => {
      const repoPath = chain.network_type === 'mainnet' ? repoPathMainnet : repoPathTestnet;
      return {
        repoPath,
        chainDir: chain.chain_name
      }
    })

    const allData = await Promise.all(chainPaths.map(async ({ repoPath, chainDir }) => {
      const path = join(repoPath, chainDir);
      if (!fs.existsSync(join(path))) {
        console.log('Path does not exist:', path)
        return
      }

      const data = buildData(chainDir, repoPath);
      await client.json.set([name, chainDir].join(':'), '$', data)

      return data
    }, {}));

    await client.json.set([name, 'paths'].join(':'), '$', _.compact(allData).map(el => el.path))

    if (opts.storeMeta) await opts.storeMeta(name, _.compact(allData))

    const commit = await latestCommit()
    await client.json.set([name, 'commit'].join(':'), '$', commit)

    await client.json.set([name, 'repository'].join(':'), '$', {
      name,
      url,
      branch
    })
  }

  return {
    refresh
  }
}

export default JumperRegistryRepository
