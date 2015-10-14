# p4api
Perforce API using marchal syntax and promise

## Syntax
	var P4 = require("p4api").p4;
	
	P4.cmd(p4Cmd, input).then(function(out){
		...
	});

Where :

- `p4Cmd` is the Perforce command (string) with options separated with space.
- `input` is a optional string for input value (like password for login command).

`P4.cmd()` return a promise wich is resolved with the marchal result of the command as an object (`out`).

`out` has the following structure :

- `prompt` : string printed by perforce before the result (else empty string)
- `stat` : if exists, list of all result with code=stat
- `info` : if exists, list of all result with code=info
- `error` : if exists, list of all result with code=error





## Examples
### List of depots
	var P4 = require("p4api").p4;
	
	P4.cmd("depots").then(function(out){console.log(out);});

Result is like :

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
### Command Error
	...
	P4.cmd("mistake")
	...
Result is :

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
 
### Login (commande with prompt and input)
	...
	P4.cmd("login", "myGoodPasswd")
	...
Result is like :

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

### Check Login (commande with param)
	...
	P4.cmd("login -s")
	...
Result is like :

	{
	  "prompt": "",
	  "stat": [
	    {
	      "code": "stat",
	      "TicketExpiration": "85062",
	      "user": "xxxx"
	    }
	  ]
	}       

### Clear viewpathes of the current Client
    function clearViewPathes() {
        return P4.cmd('client -o')
        .then(function(out) {
            client = out.stat[0];
            for (var i = 0;; i++) {
                if (client['View' + i] === undefined) break;
                delete client['View' + i];
            }

            return P4.cmd('client -i', client);
        })
        .then(function(out) {
            return P4.cmd('sync -f');
        })
    }


