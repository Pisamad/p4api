# p4api
Perforce API using marchal syntax and promise.

Allow p4 command in asynchro (promise) or synchro mode.

##Installation
Get the module from NPM

``` bash
$ npm install p4api --save
```

##Development
Use build action (npm or yarn) to build lib/p4api.js.

To test it, you need to have installed "Helix Core Apps" and "Helix Versioning Engine" (p4 & p4d). 

## Syntax
``` javascript
import {P4, P4apiTimeoutError} from "p4api";
let p4 = new P4({P4PORT: "p4server:1666"});

// Asynchro mode
p4.cmd(p4Cmd, input)
  .then(function (out) {
    // ...
  }, function (err) {
    throw ("p4 not found");
  });

// Synchro mode
try {
  let out = p4.cmdSync(p4Cmd, input);
} catch (err) {
  throw ("p4 not found");
}
```
Where:

- `p4Cmd` is the Perforce command (string) with options separated with space.
- `input` is a optional string for input value (like password for login command).

`p4.cmd()` return a promise wich is resolved with the marchal result of the command as an object (`out`).\
`p4.cmdSync()` return the marchal result of the command as an object (`out`).

`out` has the following structure:

- `prompt`: string printed by perforce before the result (else empty string)
- `stat`: if exists, list of all result with code=stat
- `info`: if exists, list of all result with code=info
- `error`: if exists, list of all result with code=error

P4 object is constructed with a structure containing:
- all P4 environnment variables like P4PORT, P4CHARSET, P4USER, P4CLIENT, ...
- p4api specific option like:
  * P4API_TIMEOUT: timeout in ms for cmd & cmdSync process

When timeout is reached, cmd is rejected and cmdSync is throwed 
with a ```P4ApiTimeoutError``` ```Error``` instance 
with message like ```'Timeout <timeout>ms reached')``` 

#### Cancellation feature :
A promise returned by p4.cmd() can be canceled with ```cancel()``` method, killing launched p4 process.


## Examples
### List of depots
``` javascript
import {P4} from "p4api";
let p4 = new P4({P4PORT: "p4server:1666"});
    
p4.cmd("depots").then(function(out){console.log(out);});
```

Result is like:
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

Result is:
``` json
{
  "prompt": "",
  "error": [
    {
      "code": "error",
      "data": "Unknown command.  Try \"p4 help\" for info.\n",
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
Result is like:
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
Result is like:
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
  return p4.cmd("client -o")
    .then(function (out) {
      client = out.stat[0];
      for (let i = 0;; i++) {
        if (client["View" + i] === undefined) break;
        delete client["View" + i];
      }

      return p4.cmd("client -i", client);
    })
    .then(function (out) {
      return p4.cmd("sync -f");
    });
}
```

### Clear viewpathes of the current Client (synchro mode)
``` javascript
function clearViewPathes() {
  let out = p4.cmdSync("client -o");
  let client = out.stat[0];

  for (let i = 0;; i++) {
    if (client["View" + i] === undefined) break;
    delete client["View" + i];
  }
  p4.cmdSync("client -i", client);
  p4.cmdSync("sync -f");
}
```

### Error handling
``` javascript
function P4Error(msg) {
  this.name = "p4 error";
  this.message = msg;
}

function p4Async(cmd, input) {
  return p4.cmd(cmd, input)
    .then((out) => {
      if (out.error !== undefined) {
        throw new P4Error(out.error);
      } else {
        return out;
      }
    }, (err) => {
      throw new Error("p4 not found");
    });
}

function p4Sync(cmd, input) {
  let out;
  try {
    out = p4.cmdSync(cmd, input);
  } catch (err) {
    throw new Error("p4 not found");
  }
  if (out.error !== undefined) {
    throw new P4Error(out.error);
  }
  return out;
}
```

### timeout handling
``` javascript
import {P4, P4apiTimeoutError} from "p4api";
let p4 = new P4({P4PORT: "p4server:1666", P4API_TIMEOUT: 5000});

p4.cmd(cmd, input)
.then((out) => {
  return out;
}, (err) => {
  if (err instanceof P4apiTimeoutError) {
    throw new Error("p4 timeout " + err.timeout + " ms");
  }
  throw new Error("p4 not found");
});



try {
  let out = p4.cmdSync(cmd, input);
  return out
} catch (err) {
  if (err instanceof P4apiTimeoutError) {
    throw new Error("p4 timeout " + err.timeout + " ms");
  }
  throw new Error("p4 not found");
}
```

### Cancellation
``` javascript
let p4Promise = p4.cmd("clients");
...
let   result = null;
if (DoNotNeedResult) {
  p4Promise.cancel();
} else {
  result = await p4Promise;
}
```

