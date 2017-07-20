var p4 = require('../p4');
var assert = require('assert');
var should = require('should');

function p4WithSyncIs(sync, cmd, input, test){
    if (sync){
        var out = p4.cmdSync(cmd, input)
        test(out)
    }else{
        return p4.cmd(cmd, input).then(test)
    }
}


describe('p4 sync', function(){p4Test(true)})
describe('p4 Async', function(){p4Test(false)})

    

function p4Test(sync) {
    
    function p4Cmd(cmd,input, test){return p4WithSyncIs(sync, cmd, input, test)};
    
    describe('set', function() {
        it('command p4 set', function() {
            return p4Cmd('set', undefined, function(out){
                should(out).have.property('stat')
            })
        })
    })
    
    describe('login', function() {
        it.skip('command p4 login', function() {
            return p4Cmd('login '+login.login, login.password, function(out){
                should(out).have.property('stat')
            })
        })
    })

    describe('bad command', function() {
        it('bad commande make an error', function() {
            this.timeout(10000);
            return p4Cmd('xyz', undefined, function(out){
                out.should.have.property('error')
            })
        })
    })
}