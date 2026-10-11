import { Store, password, requireThat } from './db.js';
const store=new Store(process.env.LOOM_DB||'data/loom.sqlite');
try{requireThat(process.argv[2]==='init','Usage: npm run init');requireThat(!store.get('SELECT username FROM account'),'Account already initialized');requireThat(process.env.LOOM_PASSWORD && process.env.LOOM_PASSWORD.length>=12,'Set LOOM_PASSWORD to at least 12 characters');store.run('INSERT INTO account VALUES(?,?)',process.env.LOOM_USER||'admin',password(process.env.LOOM_PASSWORD));console.log('Account initialized');}finally{store.close();}
