# p4api
Perforce API using marchal syntax and promise.

Allow p4 command in asynchro (promise) or synchro mode.

## Syntax
``` javascript
	var p4 = require('p4api/p4');
	
    # Asynchro mode
	p4.cmd(p4Cmd, input)
    .then(function(out){
		...
	}, function(err){
        throw('p4 not found')
    });
    
    # Synchro mode
    try{
        out = p4.cmdSync(p4Cmd, input)
    } catch(err){
        throw('p4 not found')
    }    
```
Where :

- `p4Cmd` is the Perforce command (string) with options separated with space.
- `input` is a optional string for input value (like password for login command).

`p4.cmd()` return a promise wich is resolved with the marchal result of the command as an object (`out`).
`p4.cmdSync()` return the marchal result of the command as an object (`out`).

`out` has the following structure :

- `prompt` : string printed by perforce before the result (else empty string)
- `stat` : if exists, list of all result with code=stat
- `info` : if exists, list of all result with code=info
- `error` : if exists, list of all result with code=error





## Examples
### List of depots
``` javascript
	var p4 = require('p4api');
	
	p4.cmd("depots").then(function(out){console.log(out);});
```

Result is like :
``` json
	{
	  "prompt": "",
	  "stat": [
	    {
	      "code": "stat",
	      "name": "CM",
	      "time": "1314373478",
	      "type": "local",
	      "map": "/perforce/Data/CM/...",
	      "desc": "Created by xxxx. ..."
		},
	    {
	      "code": "stat",
	      "name": "depot",
	      "time": "1314374519",
	      "type": "local",
	      "map": "/perforce/Data/depot/...",
	      "desc": "Created by xxxx. ..."
	    }
	  ]
	}
```

### Command Error
``` javascript
	...
	p4.cmd("mistake")
	...
```

Result is :
``` json
	{
	  "prompt": "",
	  "error": [
	    {
	      "code": "error",
	      "data": "Unknown command.  Try 'p4 help' for info.\n",
	      "severity": 3,
	      "generic": 1
	    }
	  ]
	}       
```

### Login (commande with prompt and input)
``` javascript
	...
	p4.cmd("login", "myGoodPasswd")
	...
```
Result is like :
``` json
	{
	  "prompt": "Enter password: ↵",
	  "info": [
	    {
	      "code": "info",
	      "data": "Success:  Password verified.",
	      "level": 5
	    },
	    {
	      "code": "info",
	      "data": "User toto logged in.",
	      "level": 0
	    }
	  ]
	}       
```

### Check Login (commande with param)
``` javascript
	...
	p4.cmd("login -s")
	...
```
Result is like :
``` json
	{
	  "prompt": "",
	  "stat": [
	    {
	      "code": "stat",
	      "TicketExpiration": "85062",
	      "user": "toto"
	    }
	  ]
	}       
```

### Clear viewpathes of the current Client (promise mode)
``` javascript
    function clearViewPathes() {
        return p4.cmd('client -o')
        .then(function(out) {
            client = out.stat[0];
            for (var i = 0;; i++) {
                if (client['View' + i] === undefined) break;
                delete client['View' + i];
            }

            return p4.cmd('client -i', client);
        })
        .then(function(out) {
            return p4.cmd('sync -f');
        })
    }
```

### Clear viewpathes of the current Client (synchro mode)
``` javascript
    function clearViewPathes() {
        var out = p4.cmdSync('client -o')
        var client = out.stat[0]
        for (var i = 0;; i++) {
            if (client['View' + i] === undefined) break;
            delete client['View' + i];
        }
        p4.cmdSync('client -i', client);
        p4.cmdSync('sync -f');
    }
```

### Error handling
``` javascript
    function P4Error(msg){
        this.name = 'p4 error'
        this.message = msg
    }
    
    function p4Async(cmd, input){
        return p4.cmd(cmd, input)
        .then(function(out){
            if (out.error !== undefined){
                throw new P4Error(out.error)
            } else {
                return out
            }
        }, function(err){
            throw new Error('p4 not found')
        })
    }

    function p4Sync(cmd, input){
        try{
            var out = p4.cmdSync(cmd, input)
        } catch(err){
            throw new Error('p4 not found')
        }
        if (out.error !== undefined){
            throw new P4Error(out.error)
        }
        return out
    }
```