import { writeFile } from "node:fs/promises";
import { createDatabase } from "../tests/database/harness.mjs";

const db = await createDatabase();
try {
  const { rows: columns } = await db.query(`select table_name, column_name, udt_name, is_nullable, column_default
    from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`);
  const { rows: foreignKeys } = await db.query(`
    select c.conname as name, rel.relname as table_name, ref.relname as referenced_table,
      array_agg(a.attname order by k.ordinality) as columns,
      array_agg(ra.attname order by k.ordinality) as referenced_columns,
      exists (select 1 from pg_constraint u where u.conrelid = c.conrelid
        and u.contype in ('u', 'p') and u.conkey @> c.conkey and u.conkey <@ c.conkey) as one_to_one
    from pg_constraint c join pg_class rel on rel.oid = c.conrelid
      join pg_namespace n on n.oid = rel.relnamespace join pg_class ref on ref.oid = c.confrelid
      cross join lateral unnest(c.conkey, c.confkey) with ordinality k(attnum, refattnum, ordinality)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = k.refattnum
    where c.contype = 'f' and n.nspname = 'public'
    group by c.oid, c.conname, rel.relname, ref.relname`);
  const { rows: functions } = await db.query(`select p.proname, p.proargnames,
    array(select typname from unnest(p.proargtypes) with ordinality a(oid, idx)
      join pg_type t on t.oid = a.oid order by a.idx) as argtypes,
    t.typname as result_type from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype where n.nspname = 'public' order by p.proname`);
  function type(name) {
    if (["uuid", "text", "timestamptz", "timestamp", "date", "varchar"].includes(name)) return "string";
    if (["int2", "int4", "int8", "float4", "float8", "numeric"].includes(name)) return "number";
    if (name === "bool") return "boolean";
    if (["json", "jsonb"].includes(name)) return "Json";
    if (name === "void") return "undefined";
    if (name.startsWith("_")) return `${type(name.slice(1))}[]`;
    throw new Error(`Add a database type mapping for ${name}`);
  }
  const tables = [...new Set(columns.map((c) => c.table_name))].map((table) => {
    const fields = columns.filter((c) => c.table_name === table);
    const shapes = ["Row", "Insert", "Update"].map((shape) => `${shape}: {\n${fields.map((c) =>
      `        ${c.column_name}${shape === "Update" || (shape === "Insert" && (c.column_default !== null || c.is_nullable === "YES")) ? "?" : ""}: ${type(c.udt_name)}${c.is_nullable === "YES" ? " | null" : ""};`).join("\n")}\n      };`).join("\n      ");
    const relations = foreignKeys.filter((r) => r.table_name === table).map((r) =>
      `{ foreignKeyName: ${JSON.stringify(r.name)}; columns: ${JSON.stringify(r.columns)}; isOneToOne: ${r.one_to_one}; referencedRelation: ${JSON.stringify(r.referenced_table)}; referencedColumns: ${JSON.stringify(r.referenced_columns)} }`);
    return `    ${table}: {\n      ${shapes}\n      Relationships: [${relations.join(", ")}];\n    };`;
  }).join("\n");
  const rpc = functions.map((f) => `    ${f.proname}: { Args: ${f.argtypes.length ? `{ ${f.argtypes.map((a, i) => `${f.proargnames[i]}: ${type(a)}`).join("; ")} }` : "Record<PropertyKey, never>"}; Returns: ${type(f.result_type)} };`).join("\n");
  const output = `// Generated from replayed migrations by npm run db:types. Do not edit manually.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\nexport type Database = {\n  public: {\n    Tables: {\n${tables}\n    };\n    Views: Record<string, never>;\n    Functions: {\n${rpc}\n    };\n    Enums: Record<string, never>;\n    CompositeTypes: Record<string, never>;\n  };\n};\n`;
  await writeFile(new URL("../src/types/database.ts", import.meta.url), output);
  console.log(`Generated types for ${new Set(columns.map((c) => c.table_name)).size} tables and ${functions.length} functions from clean migration replay.`);
} finally {
  await db.close();
}
