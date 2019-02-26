/* global describe, it, before */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {P4} from '../lib/p4api';
import {server} from './helper/server';
import _ from 'lodash';

chai.use(chaiAsPromised);

const expect = chai.expect;
const assert = chai.assert;

chai.should();

server.silent = true; // Server action is not verbose

let p4api;
let p4Res;

console.clear();
describe('p4api test', () => {
  describe('No connected commands', () => {
    before(() => {
    });
    beforeEach(() => {
      p4Res = null;
    });
    describe('P4 set', () => {
      p4api = new P4();
      it('return a set of P4 env var', async () => {
        p4Res = await p4api.cmd('set');
        expect(p4Res).to.have.property('stat').that.is.an('array');
        expect(_.chain(p4Res.stat[0])
          .filter((v, k) => (!k.startsWith('P4')))
          .value()).to.be.empty;
        // expect(p4Res.stat).to.have.property('P4PORT');
      });
    });
  });

  describe('Server down', () => {
    before(async () => {
      if (server.isActive()) {
        await server.stop();
      }
      await server.create();
      await server.start();

      p4api = new P4({P4PORT: 'local_host:1999', P4USER: 'bob', P4CHARSET: 'utf8', P4APITIMEOUT: 1000});
    });
    after(async () => {
      if (server.isActive()) {
        await server.stop();
      }
    });
    beforeEach(() => {
      p4Res = null;
    });

    describe('P4 login', () => {
      it('Async Timeout exception', () => {
        return p4api.cmd('login').should.be.rejected;
      });

      it('Sync Timeout exception', () => {
        assert.throws(()=>p4api.cmdSync('login'));
      });
    });
  });

  describe('Connected commands', () => {
    before(async () => {
      if (server.isActive()) {
        await server.stop();
      }
      await server.create();
      await server.start();

      p4api = new P4({P4PORT: 'localhost:1999', P4USER: 'bob', P4CHARSET: 'utf8'});
    });
    beforeEach(() => {
      p4Res = null;
    });

    after(async () => {
      if (server.isActive()) {
        await server.stop();
      }
    });

    describe('Try text input injection with login command', () => {
      it('Login with bad pwd return Error', async () => {
        p4Res = await p4api.cmd('login', 'badPassword');
        // console.dir(p4Res);
        expect(p4Res).to.have.property('error').that.is.an('array');
        expect(p4Res).to.not.have.property('stat');
        expect(p4Res.error[0]).to.have.any.keys('data', 'severity', 'generic');
        expect(p4Res.error[0].data).to.equal('Password invalid.\n');
      });
      it('Login with good pwd return User & Expiration', async () => {
        p4Res = await p4api.cmd('login', 'thePassword');
        expect(p4Res).to.not.have.property('error');
        expect(p4Res).to.have.property('stat').that.is.an('array');
        expect(p4Res.stat[0]).to.have.any.keys('User', 'Expiration');
        expect(p4Res.stat[0].User).to.equal('bob');
      });
    });

    describe('Try object input injection with client command', () => {
      it('Create a client from a description', async () => {
        p4Res = await p4api.cmd('client -i', {
          code: 'stat',
          Client: 'myClient',
          Owner: 'bob',
          Host: '',
          Description: 'Created by bob.\n',
          Root: 'C:\\',
          Options: 'noallwrite noclobber nocompress unlocked nomodtime normdir',
          SubmitOptions: 'submitunchanged',
          LineEnd: 'local',
          View0: '//team2/... //myClient/team2/...',
          View1: '//team1/... //myClient/team1/...',
          View2: '//depot/... //myClient/depot/...',
          Type: 'writeable',
          Backup: 'enable'
        });
        // console.dir(p4Res)
        expect(p4Res).to.not.have.property('error');
        expect(p4Res).to.have.property('info').that.is.an('array');
        expect(p4Res.info[0]).to.have.any.keys('level', 'data');
        expect(p4Res.info[0].data).to.equal('Client myClient saved.');

      });
    });

    describe('Try P4 result', () => {
      it('P4 depots return the list of depots in stat', async () => {
        p4Res = await p4api.cmd('depots');
        expect(p4Res).to.not.have.property('error');
        expect(p4Res).to.have.property('stat').that.is.an('array');
        expect(_.chain(p4Res.stat)
          .map('name')
          .difference(server.Depots)
          .difference(['depot', 'dummy'])
          .value()).to.be.empty;
      });
    });

    describe('Try error handle', () => {
      it('Bad command return an error', async () => {
        p4Res = await p4api.cmd('bad command');
        expect(p4Res).to.not.have.property('stat');
        expect(p4Res).to.have.property('error').that.is.an('array');
        expect(p4Res.error[0]).to.have.any.keys('data', 'severity', 'generic');
      });
    });

  });
});
