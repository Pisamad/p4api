/* global describe, it, before, beforeEach, after */
/* eslint-disable no-unused-expressions */

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { P4 } from '..'
import { server } from './helper/server'
import _ from 'lodash'

chai.use(chaiAsPromised)

const expect = chai.expect
const assert = chai.assert

chai.should()

server.silent = true // Server action is not verbose

let p4Res

console.clear()
describe('p4api test', () => {
  describe('No connected commands', () => {
    before(() => {
    })
    beforeEach(() => {
      p4Res = null
    })
    describe('P4 set', () => {
      const p4api = new P4()

      it('return a set of P4 env var', async () => {
        p4Res = await p4api.cmd('set')
        expect(p4Res).to.have.property('stat').that.is.an('array')
        expect(_.chain(p4Res.stat[0])
          .filter((v, k) => (!k.startsWith('P4')))
          .value()).to.be.empty
        // expect(p4Res.stat).to.have.property('P4PORT');
      })
    })
  })

  describe('Server down', () => {
    before(async () => {
      if (server.isActive()) {
        await server.stop()
      }
      await server.create()
      await server.start()
    })
    after(async () => {
      if (server.isActive()) {
        await server.stop()
      }
    })
    beforeEach(() => {
      p4Res = null
    });

    [1000, 2000].forEach(timeout => {
      describe('P4 login to muted server with timeout=' + timeout, () => {
        const p4api = new P4({ P4PORT: 'local_host:1999', P4USER: 'bob', P4CHARSET: 'utf8', P4API_TIMEOUT: timeout })

        it('Async Timeout exception', (done) => {
          p4api.cmd('login', 'thePassword').should.be.rejectedWith(P4.TimeoutError, 'Timeout ' + timeout + 'ms reached').notify(done)
        })

        it('Sync Timeout exception', () => {
          assert.throws(() => p4api.cmdSync('login', 'thePassword'), P4.TimeoutError, 'Timeout ' + timeout + 'ms reached')
        })
      })
    });
    [1000, 2000].forEach(timeout => {
      describe('P4 login to unmuted server with timeout=' + timeout, () => {
        const p4api = new P4({ P4PORT: 'localhost:1999', P4USER: 'bob', P4CHARSET: 'utf8', P4API_TIMEOUT: timeout })

        it('Sync Timeout ' + timeout + ' not reached', () => {
          assert.doesNotThrow(() => p4api.cmdSync('login', 'thePassword'))
        })

        it('Async Timeout ' + timeout + ' not reached', (done) => {
          p4api.cmd('login', 'thePassword').should.be.fulfilled.notify(done)
        })
      })
    })
  })

  describe('Cancellation', () => {
    before(async () => {
      if (server.isActive()) {
        await server.stop()
      }
      await server.create()
      await server.start()
    })
    after(async () => {
      if (server.isActive()) {
        await server.stop()
      }
    })
    beforeEach(() => {
      p4Res = null
    })

    describe('Cancel', () => {
      const p4api = new P4({ P4PORT: 'localhost:1999', P4USER: 'bob', P4CHARSET: 'utf8' })

      it('?', () => {
        const promise = p4api.cmd('login', 'thePassword')

        promise.cancel()
      })
    })
  })

  describe('Client P4 not found', () => {
    let p4api

    before(async () => {
      p4api = new P4({ P4PORT: 'localhost:1999', P4USER: 'bob', P4CHARSET: 'utf8', P4API_TIMEOUT: 5000 })
      p4api.addOpts({ env: { Path: '' } })
    })
    beforeEach(() => {
      p4Res = null
    })

    after(async () => {
    })

    describe('P4 client missing raise a exception', () => {
      const cmd = 'issue10'
      it('For cmdSync', () => {
        assert.throws(() => p4api.cmdSync(cmd), p4api.Error)
      })
      it('For cmd', (done) => {
        p4api.cmd(cmd).should.be.rejectedWith(p4api.Error).notify(done)
      })
      it('For rawCmdSync', () => {
        assert.throws(() => p4api.rawCmdSync(cmd), p4api.Error)
      })
      it('For rawCmd', (done) => {
        p4api.rawCmd(cmd).should.be.rejectedWith(p4api.Error).notify(done)
      })
    })
  })

  describe('Connected commands', () => {
    let p4api

    before(async () => {
      if (server.isActive()) {
        await server.stop()
      }
      await server.create()
      await server.start()

      p4api = new P4({ P4PORT: 'localhost:1999', P4USER: 'bob', P4CHARSET: 'utf8', P4API_TIMEOUT: 5000 })
    })
    beforeEach(() => {
      p4Res = null
    })

    after(async () => {
      if (server.isActive()) {
        // await server.stop();
      }
    })

    describe('Try text input injection with login command', () => {
      it('Login with bad pwd return Error', async () => {
        p4Res = await p4api.cmd('login', 'badPassword')
        // console.dir(p4Res);
        expect(p4Res).to.have.property('error').that.is.an('array')
        expect(p4Res).to.not.have.property('stat')
        expect(p4Res.error[0]).to.have.any.keys('data', 'severity', 'generic')
        expect(p4Res.error[0].data).to.equal('Password invalid.\n')
      })
      it('Login with good pwd return User & Expiration', async () => {
        p4Res = await p4api.cmd('login', 'thePassword')
        expect(p4Res).to.not.have.property('error')
        expect(p4Res).to.have.property('stat').that.is.an('array')
        expect(p4Res.stat[0]).to.have.any.keys('User', 'Expiration')
        expect(p4Res.stat[0].User).to.equal('bob')
      })
    })

    describe('Sync - Try object input injection with client command', () => {
      it('Create a client from a description', async () => {
        p4Res = p4api.cmdSync('client -i', {
          code: 'stat',
          Client: 'myClientSync',
          Owner: 'bob',
          Host: '',
          Description: 'Created by bob.',
          Root: 'C:\\',
          Options: 'noallwrite noclobber nocompress unlocked nomodtime normdir',
          SubmitOptions: 'submitunchanged',
          LineEnd: 'local',
          View0: '//team2/... //myClientSync/team2/...',
          Type: 'writeable',
          Backup: 'enable'
        })
        // console.dir(p4Res)
        expect(p4Res).to.not.have.property('error')
        expect(p4Res).to.have.property('info').that.is.an('array')
        expect(p4Res.info[0]).to.have.any.keys('level', 'data')
        expect(p4Res.info[0].data).to.equal('Client myClientSync saved.')
      })
    })

    describe('Async - Try object input injection with client command', async () => {
      it('Create a client from a description', async () => {
        p4Res = await p4api.cmd('client -i', {
          code: 'stat',
          Client: 'myClientAsync',
          Owner: 'bob',
          Host: '',
          Description: 'Created by bob.',
          Root: 'C:\\temp\\p4',
          Options: 'noallwrite noclobber nocompress unlocked nomodtime normdir',
          SubmitOptions: 'submitunchanged',
          LineEnd: 'local',
          View0: '//team2/... //myClientAsync/team2/...',
          Type: 'writeable',
          Backup: 'enable'
        })
        // console.dir(p4Res)
        expect(p4Res).to.not.have.property('error')
        expect(p4Res).to.have.property('info').that.is.an('array')
        expect(p4Res.info[0]).to.have.any.keys('level', 'data')
        expect(p4Res.info[0].data).to.equal('Client myClientAsync saved.')
      })
    })

    describe('Try P4 result', () => {
      it('P4 depots return the list of depots in stat', async () => {
        p4Res = await p4api.cmd('depots')
        expect(p4Res).to.not.have.property('error')
        expect(p4Res).to.have.property('stat').that.is.an('array')
        expect(_.chain(p4Res.stat)
          .map('name')
          .difference(server.Depots)
          .difference(['depot', 'dummy'])
          .value()).to.be.empty
      })
    })

    describe('Try error handle', () => {
      it('Bad command return an error', async () => {
        p4Res = await p4api.cmd('bad command')
        expect(p4Res).to.not.have.property('stat')
        expect(p4Res).to.have.property('error').that.is.an('array')
        expect(p4Res.error[0]).to.have.any.keys('data', 'severity', 'generic')
      })
    })

    describe('Issue#5', () => {
      const command = ['label -i', {
        Label: 'team2_Label',
        Owner: 'bob',
        Description: '123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0',
        View0: '//team2/...',
        Revision: '@1'
      }]

      it('Async : Doesnt failed when a field input has lenght = 128', async () => {
        p4Res = await p4api.cmd(...command)
        expect(p4Res).to.not.have.property('error')
      })
      it('Sync : Doesnt failed when a field input has lenght = 128', async () => {
        p4Res = p4api.cmdSync(...command)
        expect(p4Res).to.not.have.property('error')
      })
      it('Async : Doesnt failed when a field input has lenght > 128', async () => {
        command[1].Description += 'XXX'
        p4Res = await p4api.cmd(...command)
        expect(p4Res).to.not.have.property('error')
      })
      it('Sync : Doesnt failed when a field input has lenght > 128', async () => {
        command[1].Description += 'XXX'
        p4Res = p4api.cmdSync(...command)
        expect(p4Res).to.not.have.property('error')
      })
    })
  })

  describe('Connected RAW commands', () => {
    let p4api

    before(async () => {
      if (server.isActive()) {
        await server.stop()
      }
      await server.create()
      await server.start()

      p4api = new P4({ P4PORT: 'localhost:1999', P4USER: 'bob', P4CHARSET: 'utf8', P4API_TIMEOUT: 5000 })
    })
    beforeEach(() => {
      p4Res = null
    })

    after(async () => {
      if (server.isActive()) {
        // await server.stop();
      }
    })

    describe('Try text input injection with login command', () => {
      it('Login with bad pwd return Error', async () => {
        p4Res = await p4api.rawCmd('login', 'badPassword')
        // console.dir(p4Res);
        expect(p4Res).to.have.property('text').to.include('Enter password')
        expect(p4Res).to.have.property('error').to.include('Password invalid')
      })
      it('Login with good pwd return User & Expiration', async () => {
        p4Res = await p4api.rawCmd('login', 'thePassword')
        expect(p4Res).to.have.property('text').to.include('Enter password')
        expect(p4Res).to.have.property('error').to.equal('')
        // expect(p4Res).to.have.property('stat').that.is.an('array')
        // expect(p4Res.stat[0]).to.have.any.keys('User', 'Expiration')
        // expect(p4Res.stat[0].User).to.equal('bob')
      })
    })

    describe('Sync - Try object input injection with client command', () => {
      it('Create a client from a description', async () => {
        p4Res = p4api.rawCmdSync('client -i', `
Client: myClientSync

Owner: bob

Host:
 
Description: 
  Created by bob.
  
Root: C:\\

Options: noallwrite noclobber nocompress unlocked nomodtime normdir

SubmitOptions: submitunchanged

LineEnd: local

View: 
  //team2/... //myClientSync/team2/...
  
Type: writeable

Backup: enable

`)
        // console.dir(p4Res)
        expect(p4Res).to.have.property('text').to.include('Client myClientSync saved.')
        expect(p4Res).to.have.property('error').to.equal('')
      })
    })

    describe('Async - Try object input injection with client command', async () => {
      it('Create a client from a description', async () => {
        p4Res = await p4api.rawCmd('client -i', `
Client: myClientSync

Owner: bob

Host:
 
Description: 
  Created by bob.
  
Root: C:\\

Options: noallwrite noclobber nocompress unlocked nomodtime normdir

SubmitOptions: submitunchanged

LineEnd: local

View: 
  //team2/... //myClientSync/team2/...
  
Type: writeable

Backup: enable

`)
        // console.dir(p4Res)
        expect(p4Res).to.have.property('text').to.include('Client myClientSync not changed.')
        expect(p4Res).to.have.property('error').to.equal('')
      })
    })

    describe('Try P4 result', () => {
      it('P4 depots return the list of depots in stat', async () => {
        p4Res = await p4api.rawCmd('depots')
        expect(p4Res).to.have.property('text')
        expect(p4Res).to.have.property('error').to.equal('')
      })
    })

    describe('Try error handle', () => {
      it('Bad command return an error', async () => {
        p4Res = await p4api.rawCmd('bad command')
        expect(p4Res).to.have.property('text').to.equal('')
        expect(p4Res).to.have.property('error')
      })
    })
  })
})
