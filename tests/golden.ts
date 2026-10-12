// Captures every public read of a database, so storage refactors can prove
// the API output is unchanged.
export async function capture(call: (m: any, p: string) => Promise<any>) {
  const get = async (p: string) => (await call("GET", p)).json();
  const out: any = {
    items: await get("/items"),
    categories: await get("/categories"),
  };
  out.documents = await get("/documents");
  for (const c of out.categories) {
    out["order:" + c.name] = await get(`/categories/${c.id}/order`);
    out["members:" + c.name] = await get(`/categories/${c.id}/members`);
  }
  for (const d of out.documents) {
    out["doc:" + d.name] = await get("/documents/" + d.id);
    if (d.kind === "template")
      out["revisions:" + d.name] = await get(`/templates/${d.id}/revisions`);
  }
  return out;
}
