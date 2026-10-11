export let csrf='';
export async function api(path:string,method='GET',body?:any){const response=await fetch('/api/v1'+path,{method,headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.message+(data.details?' '+JSON.stringify(data.details):''));return data;}
export function setCsrf(value:string){csrf=value;}
