set -u
cd /home/rock/cohort-005-project
PK=$(grep '^KNOCK_PUBLIC_API_KEY=' .env | cut -d= -f2- | tr -d "\"'")
CH=$(grep '^KNOCK_FEED_CHANNEL_ID=' .env | cut -d= -f2- | tr -d "\"'")
APP=http://localhost:5173
login() { rm -f /tmp/knockspike/cj; curl -s -c /tmp/knockspike/cj -b /tmp/knockspike/cj -o /dev/null -X POST -d userId=$1 $APP/api/switch-user; }
token() { curl -s -b /tmp/knockspike/cj $APP/prototype/knock | grep -o 'eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*' | head -1; }
sub() { echo "$1" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | grep -o '"sub":"[^"]*"'; }
k() { # method path token [body]
  curl -s -w '\nHTTP %{http_code}\n' -X $1 "https://api.knock.app/v1$2" -H "Authorization: Bearer $PK" -H "X-Knock-User-Token: $3" -H 'Content-Type: application/json' ${4:+-d "$4"}; }
feedmeta() { k GET /users/$1/feeds/$CH "$2" | node -e 'let s=require("fs").readFileSync(0,"utf8");let [b,h]=s.split("\nHTTP ");try{let j=JSON.parse(b);console.log("HTTP",h.trim(),"meta",JSON.stringify(j.meta),"sources",JSON.stringify(j.entries.map(e=>e.source.key+(e.read_at?":read":":unread")+(e.seen_at?"/seen":"/unseen"))))}catch{console.log("HTTP",h.trim(),b.slice(0,160))}'; }
trigger() { curl -s -b /tmp/knockspike/cj -o /dev/null -w "trigger $1->$2 HTTP %{http_code}\n" -X POST -d intent=$1 -d recipientId=$2 "$APP/prototype/knock"; }

