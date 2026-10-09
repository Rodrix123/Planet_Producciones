import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface RolEmpleado {
  id: number;
  nombre: string;
  descripcion: string | null;
}

export interface Empleado {
  id: string;
  email: string | null;
  telefono: string | null;
  nombre: string | null;
  avatarUrl: string | null;
  rolId: number | null;
  diasNoDisponibles: string[];
  creadoEn: string;
  ultimoAcceso: string | null;
}

export interface ListaEmpleados {
  roles: RolEmpleado[];
  empleados: Empleado[];
}

export interface NuevoEmpleado {
  nombre: string;
  email: string;
  password: string;
  telefono?: string;
  rolId: number;
}

export interface CambiosEmpleado {
  email?: string;
  telefono?: string;
}

/** Error con código HTTP sugerido, para que la API responda con el estado correcto. */
export class ErrorEmpleado extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

const POR_PAGINA = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function aEmpleado(u: User, rolId: number | null, dias: string[], nombrePerfil?: string | null): Empleado {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: u.id,
    email: u.email ?? null,
    telefono: u.phone ? `+${u.phone}` : (meta.telefono as string | undefined) || null,
    nombre: (nombrePerfil || meta.full_name || meta.nombre || meta.name || null) as string | null,
    avatarUrl: (meta.avatar_url ?? null) as string | null,
    rolId,
    diasNoDisponibles: dias,
    creadoEn: u.created_at,
    ultimoAcceso: u.last_sign_in_at ?? null,
  };
}

/** Teléfono en formato E.164 (lo que exige Supabase Auth). Sin prefijo se asume Colombia (+57). */
function normalizarTelefono(valor: string): string {
  const limpio = valor.replace(/[\s()-]/g, "");
  if (limpio === "") return "";
  const digitos = limpio.replace(/^\+/, "");
  if (!/^\d{8,15}$/.test(digitos)) throw new ErrorEmpleado("El teléfono no es válido.");
  if (limpio.startsWith("+")) return digitos;
  return digitos.length === 10 ? `57${digitos}` : digitos;
}

function validarEmail(email: string): string {
  const limpio = email.trim().toLowerCase();
  if (!EMAIL_RE.test(limpio)) throw new ErrorEmpleado("El correo no es válido.");
  return limpio;
}

async function perfilExiste(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErrorEmpleado("El empleado no existe.", 404);
}

async function cargarEmpleado(supabase: SupabaseClient, id: string): Promise<Empleado> {
  const [perfil, dias, usuario] = await Promise.all([
    supabase.from("profiles").select("role_id, nombre").eq("id", id).single(),
    supabase.from("unavailability_users").select("date").eq("id_user", id).order("date"),
    supabase.auth.admin.getUserById(id),
  ]);
  if (perfil.error) throw perfil.error;
  if (dias.error) throw dias.error;
  if (usuario.error) throw usuario.error;
  return aEmpleado(
    usuario.data.user,
    perfil.data.role_id as number | null,
    dias.data.map((d) => d.date as string),
    perfil.data.nombre as string | null,
  );
}

/**
 * Requiere un cliente con service role: auth.users (correo, teléfono,
 * metadatos) solo es accesible por la Admin API.
 *
 * - public.role                  -> secciones
 * - public.profiles              -> quiénes son empleados y su role_id
 * - public.unavailability_users  -> días que no pueden asistir
 * - auth.users (Admin API)       -> datos básicos del perfil
 */
export async function listarEmpleados(supabase: SupabaseClient): Promise<ListaEmpleados> {
  const [rolesRes, perfilesRes, indispRes] = await Promise.all([
    supabase.from("role").select("id, name, description").order("id"),
    supabase.from("profiles").select("id, role_id, nombre"),
    supabase.from("unavailability_users").select("id_user, date").order("date"),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (perfilesRes.error) throw perfilesRes.error;
  if (indispRes.error) throw indispRes.error;

  const rolPorPerfil = new Map<string, number | null>(
    perfilesRes.data.map((p) => [p.id as string, p.role_id as number | null]),
  );
  const nombrePorPerfil = new Map<string, string | null>(
    perfilesRes.data.map((p) => [p.id as string, p.nombre as string | null]),
  );

  const dias = new Map<string, string[]>();
  for (const i of indispRes.data) {
    const lista = dias.get(i.id_user as string) ?? [];
    lista.push(i.date as string);
    dias.set(i.id_user as string, lista);
  }

  const empleados: Empleado[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw error;
    for (const u of data.users) {
      if (!rolPorPerfil.has(u.id)) continue; // usuario de auth sin perfil: no es empleado
      empleados.push(aEmpleado(u, rolPorPerfil.get(u.id) ?? null, dias.get(u.id) ?? [], nombrePorPerfil.get(u.id)));
    }
    if (data.users.length < POR_PAGINA) break;
  }

  return {
    roles: rolesRes.data.map((r) => ({
      id: r.id as number,
      nombre: r.name as string,
      descripcion: (r.description as string | null) ?? null,
    })),
    empleados,
  };
}

/** Crea el usuario en auth.users y su fila en public.profiles con el rol indicado. */
export async function crearEmpleado(supabase: SupabaseClient, datos: NuevoEmpleado): Promise<Empleado> {
  const nombre = datos.nombre?.trim();
  if (!nombre) throw new ErrorEmpleado("El nombre es obligatorio.");
  const email = validarEmail(datos.email ?? "");
  if (!datos.password || datos.password.length < 6) {
    throw new ErrorEmpleado("La contraseña debe tener al menos 6 caracteres.");
  }
  const telefono = datos.telefono ? normalizarTelefono(datos.telefono) : "";

  const rol = await supabase.from("role").select("id").eq("id", datos.rolId).maybeSingle();
  if (rol.error) throw rol.error;
  if (!rol.data) throw new ErrorEmpleado("El rol no existe.");

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: datos.password,
    email_confirm: true,
    ...(telefono ? { phone: telefono, phone_confirm: true } : {}),
    user_metadata: { full_name: nombre },
  });
  if (error) {
    throw new ErrorEmpleado(
      /already|registered|exists/i.test(error.message) ? "Ya existe un usuario con ese correo o teléfono." : error.message,
      /already|registered|exists/i.test(error.message) ? 409 : 400,
    );
  }

  const perfil = await supabase.from("profiles").insert({ id: data.user.id, role_id: datos.rolId, nombre, correo: email });
  if (perfil.error) {
    await supabase.auth.admin.deleteUser(data.user.id); // no dejar un usuario sin perfil
    throw perfil.error;
  }
  return aEmpleado(data.user, datos.rolId, [], nombre);
}

/** Modifica el correo (auth.users y profiles.correo) y/o el teléfono (auth.users). */
export async function actualizarEmpleado(
  supabase: SupabaseClient,
  id: string,
  cambios: CambiosEmpleado,
): Promise<Empleado> {
  await perfilExiste(supabase, id);

  const attrs: Record<string, unknown> = {};
  if (cambios.email !== undefined) {
    attrs.email = validarEmail(cambios.email);
    attrs.email_confirm = true;
  }
  if (cambios.telefono !== undefined) {
    const telefono = normalizarTelefono(cambios.telefono);
    // La Admin API de Supabase Auth no permite borrar un teléfono ya registrado.
    if (telefono === "") throw new ErrorEmpleado("El teléfono no se puede borrar; escribe uno nuevo.");
    attrs.phone = telefono;
    attrs.phone_confirm = true;
  }
  if (Object.keys(attrs).length === 0) throw new ErrorEmpleado("No hay cambios para guardar.");

  const { error } = await supabase.auth.admin.updateUserById(id, attrs);
  if (error) {
    const duplicado = /already|registered|exists|duplicate/i.test(error.message);
    throw new ErrorEmpleado(
      duplicado ? "Ya existe un usuario con ese correo o teléfono." : error.message,
      duplicado ? 409 : 400,
    );
  }
  if (typeof attrs.email === "string") {
    const perfil = await supabase.from("profiles").update({ correo: attrs.email }).eq("id", id);
    if (perfil.error) throw perfil.error;
  }
  return cargarEmpleado(supabase, id);
}

/** Elimina el usuario de auth.users; su perfil y sus indisponibilidades caen en cascada. */
export async function eliminarEmpleado(supabase: SupabaseClient, id: string): Promise<void> {
  await perfilExiste(supabase, id);
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw error;
}
