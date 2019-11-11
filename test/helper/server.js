/**
 * Manage local P4 server for test
 */

import shell from 'shelljs'
import { P4 } from '../..'
import _ from 'lodash'
import Q from 'bluebird'

const p4d = '"C:/Program Files/Perforce/Server/p4d.exe" '
const serverName = 'P4TestServer'

const p4Admin = new P4({ P4PORT: 'localhost:1999', P4USER: 'admin', P4CHARSET: 'utf8' })
const Users = ['bob', 'alice']
const Depots = ['team1', 'team2']

export const server = {
  create,
  start,
  stop,
  empty,
  isActive,
  Depots,
  Users,
  silent: false
}

function isActive () {
  const out = p4Admin.cmdSync('login -s')

  return (out.error === undefined)
}

/**
 * create a new local server
 * with 4 Users :
 * - admin (super user)
 * - alice, bob and duot
 *
 * with a stream depot : dummy
 * with 3 Depots : team1, team2, team3
 *
 */
async function create () {
  try {
    await stop()
  } catch (e) {
    console.log(e)
    // Nothing to do
  }
  const pwd = shell.pwd()
  // Goto ~/P4Server empty

  shell.cd()
  shell.rm('-rf', serverName)

  shell.mkdir(serverName)
  shell.cd(serverName)

  await start()

  // Add Users
  _.map(Users, (user) => {
    p4Admin.cmdSync('user -i -f', {
      User: user,
      Email: user + '@p4api',
      FullName: user
    })
  })
  // Allow only admin as super user
  p4Admin.cmdSync('user -i -f', {
    User: 'admin',
    Email: 'admin@p4api',
    FullName: 'Admin'
  })
  p4Admin.cmdSync('protect -i', {
    Protections0: 'write user * * //...',
    Protections1: 'super user admin * //...'
  })
  _.map(Users, function (user) {
    p4Admin.cmdSync('password ' + user, 'thePassword\nthePassword')
  })

  // Add some Depots
  p4Admin.cmdSync('depot -i', {
    Depot: 'dummy',
    Type: 'stream',
    StreamDepth: '//dummy/1',
    Map: 'dummy/...'
  })
  _.map(Depots, function (depot) {
    p4Admin.cmdSync('depot -i', {
      Depot: depot,
      Type: 'local',
      Map: depot + '/...'
    })
  })
  // Stop the server
  try {
    await stop()
  } finally {
    shell.cd(pwd)
  }
}

/**
 * Start the server
 */
async function start () {
  const pwd = shell.pwd()

  await new Q((resolve, reject) => {
    // Goto ~/P4Server
    shell.cd()
    shell.cd(serverName)
    // Force utf8 mode
    shell.exec(p4d + '-q -xi', { silent: server.silent })

    // Use 1999 port. 1666 could be use by DVCS
    let dataOut = ''

    shell.exec(p4d + '-p 1999 -L p4.log -J p4.jnl -r .', { async: true, silent: server.silent })
      .on('error', (err) => {
        reject(err)
      })
      .on('close', () => {
        reject(new Error('server is stopped'))
      })
      .stdout.on('data', (data) => {
        dataOut += data
        // console.info('data',data)
        if (dataOut.includes('Perforce Server starting...')) {
          resolve()
        }
      })
  })
    .finally(() => {
      shell.cd(pwd)
      //      console.log('*** START SERVER ***')
    })
}

/**
 * Stop the server
 */
async function stop () {
  await p4Admin.cmd('admin stop')
  await Q.delay(2000)
//  console.log('*** STOP SERVER ***')
}

async function empty () {
  await Q.map(Depots, (depot) => (
    p4Admin.cmd('obliterate -y //' + depot + '/...')
  ))
//  console.log('*** EMPTY SERVER ***')
}
