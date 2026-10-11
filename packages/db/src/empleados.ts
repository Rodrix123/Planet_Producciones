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
  /** Cédula de ciudadanía, solo números (user_metadata.cedula en auth.users). */
  cedula: string | null;
  avatarUrl: string | null;
  rolId: number | null;
  /** public.profiles.bank_account */
  cuentaBancaria: string | null;
  /** public.profiles.key */
  llave: string | null;
  diasNoDisponibles: string[];
  creadoEn: string;
  ultimoAcceso: string | null;
}

export interface ListaEmpleados {
  roles: RolEmpleado[];
  empleados: Empleado[];
}

/** La contraseña no se pide: todo empleado nuevo se crea con CLAVE_INICIAL. */
export interface NuevoEmpleado {
  nombre: string;
  /** Cédula de ciudadanía: solo números, sin puntos. */
  cedula: string;
  email: string;
  telefono?: string;
  rolId: number;
  cuentaBancaria?: string;
  llave?: string;
}

/** Cadena vacía en cuentaBancaria o llave borra el dato. */
export interface CambiosEmpleado {
  email?: string;
  telefono?: string;
  cuentaBancaria?: string;
  llave?: string;
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

/** Contraseña con la que se crean todos los empleados nuevos. */
export const CLAVE_INICIAL = "123456789";

const POR_PAGINA = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CEDULA_RE = /^\d{6,10}$/;
const MAX_DATO_BANCARIO = 100;

/** Lo que guarda public.profiles de cada empleado. */
interface PerfilEmpleado {
  rolId: number | null;
  cuentaBancaria: string | null;
  llave: string | null;
}

const aPerfil = (p: { role_id?: unknown; bank_account?: unknown; key?: unknown }): PerfilEmpleado => ({
  rolId: (p.role_id as number | null | undefined) ?? null,
  cuentaBancaria: (p.bank_account as string | null | undefined) ?? null,
  llave: (p.key as string | null | undefined) ?? null,
});

/** Texto libre (cuenta bancaria o llave): se recorta, y vacío o ausente es null (sin dato). */
function datoBancario(valor: unknown, campo: string): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") throw new ErrorEmpleado(`${campo} no es válida.`);
  const limpio = valor.trim();
  if (limpio.length > MAX_DATO_BANCARIO) {
    throw new ErrorEmpleado(`${campo} no puede superar los ${MAX_DATO_BANCARIO} caracteres.`);
  }
  return limpio === "" ? null : limpio;
}

/**
 * Nombre de un usuario de auth.users: lo que guardan sus metadatos (el que
 * escribe este módulo al crear el empleado es full_name). public.profiles ya
 * no guarda nombre ni correo.
 */
export function nombreDeUsuario(u: User): string | null {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  for (const valor of [meta.full_name, meta.nombre, meta.name, meta.display_name]) {
    if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  }
  return null;
}

/** Cédula guardada en los metadatos del usuario (user_metadata.cedula), sin espacios. */
function cedulaDeUsuario(u: User): string | null {
  const valor = ((u.user_metadata ?? {}) as Record<string, unknown>).cedula;
  const texto = typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
  return texto === "" ? null : texto;
}

/** La cédula se escribe solo con números (6 a 10), sin puntos, espacios ni letras. */
function validarCedula(valor: unknown): string {
  const cedula = typeof valor === "string" ? valor.trim() : "";
  if (cedula === "") throw new ErrorEmpleado("La cédula es obligatoria.");
  if (!CEDULA_RE.test(cedula)) {
    throw new ErrorEmpleado("La cédula debe tener entre 6 y 10 números, sin puntos, espacios ni letras.");
  }
  return cedula;
}

/** ¿Algún usuario de auth.users ya tiene esa cédula? */
async function cedulaYaRegistrada(supabase: SupabaseClient, cedula: string): Promise<boolean> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw error;
    if (data.users.some((u) => cedulaDeUsuario(u) === cedula)) return true;
    if (data.users.length < POR_PAGINA) return false;
  }
}

function aEmpleado(u: User, perfil: PerfilEmpleado, dias: string[]): Empleado {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: u.id,
    email: u.email ?? null,
    telefono: u.phone ? `+${u.phone}` : (meta.telefono as string | undefined) || null,
    nombre: nombreDeUsuario(u),
    cedula: cedulaDeUsuario(u),
    avatarUrl: (meta.avatar_url ?? null) as string | null,
    rolId: perfil.rolId,
    cuentaBancaria: perfil.cuentaBancaria,
    llave: perfil.llave,
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
    supabase.from("profiles").select("role_id, bank_account, key").eq("id", id).single(),
    supabase.from("unavailability_users").select("date").eq("id_user", id).order("date"),
    supabase.auth.admin.getUserById(id),
  ]);
  if (perfil.error) throw perfil.error;
  if (dias.error) throw dias.error;
  if (usuario.error) throw usuario.error;
  return aEmpleado(usuario.data.user, aPerfil(perfil.data), dias.data.map((d) => d.date as string));
}

/**
 * Requiere un cliente con service role: auth.users (nombre, correo, teléfono,
 * metadatos) solo es accesible por la Admin API.
 *
 * - public.role                  -> secciones
 * - public.profiles              -> quiénes son empleados, su role_id, cuenta bancaria y llave
 * - public.unavailability_users  -> días que no pueden asistir
 * - auth.users (Admin API)       -> todos los demás datos del usuario que se muestran
 */
export async function listarEmpleados(supabase: SupabaseClient): Promise<ListaEmpleados> {
  const [rolesRes, perfilesRes, indispRes] = await Promise.all([
    supabase.from("role").select("id, name, description").order("id"),
    supabase.from("profiles").select("id, role_id, bank_account, key"),
    supabase.from("unavailability_users").select("id_user, date").order("date"),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (perfilesRes.error) throw perfilesRes.error;
  if (indispRes.error) throw indispRes.error;

  const perfilPorId = new Map<string, PerfilEmpleado>(perfilesRes.data.map((p) => [p.id as string, aPerfil(p)]));

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
      const perfil = perfilPorId.get(u.id);
      if (!perfil) continue; // usuario de auth sin perfil: no es empleado
      empleados.push(aEmpleado(u, perfil, dias.get(u.id) ?? []));
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

/**
 * Crea el usuario en auth.users (nombre y cédula en sus metadatos, correo y teléfono,
 * con la contraseña CLAVE_INICIAL) y su fila en public.profiles con el rol y, si se
 * indican, la cuenta bancaria y la llave.
 * El resto de columnas de profiles (p. ej. debe_cambiar_password, que la base deja
 * en true) toma su valor por defecto.
 */
export async function crearEmpleado(supabase: SupabaseClient, datos: NuevoEmpleado): Promise<Empleado> {
  const nombre = datos.nombre?.trim();
  if (!nombre) throw new ErrorEmpleado("El nombre es obligatorio.");
  const cedula = validarCedula(datos.cedula);
  const email = validarEmail(datos.email ?? "");
  const telefono = datos.telefono ? normalizarTelefono(datos.telefono) : "";
  const cuentaBancaria = datoBancario(datos.cuentaBancaria, "La cuenta bancaria");
  const llave = datoBancario(datos.llave, "La llave");

  const rol = await supabase.from("role").select("id").eq("id", datos.rolId).maybeSingle();
  if (rol.error) throw rol.error;
  if (!rol.data) throw new ErrorEmpleado("El rol no existe.");

  if (await cedulaYaRegistrada(supabase, cedula)) {
    throw new ErrorEmpleado("Ya existe un empleado con esa cédula.", 409);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: CLAVE_INICIAL,
    email_confirm: true,
    ...(telefono ? { phone: telefono, phone_confirm: true } : {}),
    user_metadata: { full_name: nombre, cedula },
  });
  if (error) {
    throw new ErrorEmpleado(
      /already|registered|exists/i.test(error.message) ? "Ya existe un usuario con ese correo o teléfono." : error.message,
      /already|registered|exists/i.test(error.message) ? 409 : 400,
    );
  }

  const perfil = await supabase.from("profiles").insert({
    id: data.user.id,
    role_id: datos.rolId,
    ...(cuentaBancaria ? { bank_account: cuentaBancaria } : {}),
    ...(llave ? { key: llave } : {}),
  });
  if (perfil.error) {
    await supabase.auth.admin.deleteUser(data.user.id); // no dejar un usuario sin perfil
    throw perfil.error;
  }
  return aEmpleado(data.user, { rolId: datos.rolId, cuentaBancaria, llave }, []);
}

/**
 * Modifica el correo y/o el teléfono (viven solo en auth.users) y la cuenta bancaria
 * y/o la llave (public.profiles). Todo se valida antes de escribir.
 */
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
  const perfil: Record<string, string | null> = {};
  if (cambios.cuentaBancaria !== undefined) {
    perfil.bank_account = datoBancario(cambios.cuentaBancaria, "La cuenta bancaria");
  }
  if (cambios.llave !== undefined) perfil.key = datoBancario(cambios.llave, "La llave");

  if (Object.keys(attrs).length === 0 && Object.keys(perfil).length === 0) {
    throw new ErrorEmpleado("No hay cambios para guardar.");
  }

  if (Object.keys(attrs).length > 0) {
    const { error } = await supabase.auth.admin.updateUserById(id, attrs);
    if (error) {
      const duplicado = /already|registered|exists|duplicate/i.test(error.message);
      throw new ErrorEmpleado(
        duplicado ? "Ya existe un usuario con ese correo o teléfono." : error.message,
        duplicado ? 409 : 400,
      );
    }
  }
  if (Object.keys(perfil).length > 0) {
    const { error } = await supabase.from("profiles").update(perfil).eq("id", id);
    if (error) throw error;
  }
  return cargarEmpleado(supabase, id);
}

export interface NuevaIncapacidad {
  /** Primer día no disponible, YYYY-MM-DD. */
  desde: string;
  /** Último día (inclusive); si falta, es solo el día `desde`. */
  hasta?: string;
}

/** Tope de días seguidos que se registran de una vez (evita un rango escrito por error). */
const MAX_DIAS_INCAPACIDAD = 120;

/** Fecha real en formato YYYY-MM-DD (rechaza, por ejemplo, 2026-02-31). */
function fechaISO(valor: unknown, campo: string): string {
  const fecha = typeof valor === "string" ? valor.trim() : "";
  const d = new Date(`${fecha}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
    throw new ErrorEmpleado(`${campo} no es válida.`);
  }
  return fecha;
}

/** Todos los días entre dos fechas ISO, ambas incluidas. */
function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const fin = new Date(`${hasta}T00:00:00Z`).getTime();
  for (let t = new Date(`${desde}T00:00:00Z`).getTime(); t <= fin; t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/**
 * Registra una incapacidad: marca como no disponible al empleado uno o varios días
 * seguidos (public.unavailability_users). Los días que ya estaban registrados no se
 * duplican; si no queda ninguno nuevo, responde 409. Se permiten fechas pasadas.
 */
export async function agregarIncapacidad(
  supabase: SupabaseClient,
  id: string,
  datos: NuevaIncapacidad,
): Promise<Empleado> {
  await perfilExiste(supabase, id);

  const desde = fechaISO(datos?.desde, "La fecha");
  const hasta = datos?.hasta ? fechaISO(datos.hasta, "La fecha final") : desde;
  if (hasta < desde) throw new ErrorEmpleado("La fecha final no puede ser anterior a la inicial.");
  const dias = diasEntre(desde, hasta);
  if (dias.length > MAX_DIAS_INCAPACIDAD) {
    throw new ErrorEmpleado(`La incapacidad no puede superar los ${MAX_DIAS_INCAPACIDAD} días seguidos.`);
  }

  const existentes = await supabase
    .from("unavailability_users")
    .select("date")
    .eq("id_user", id)
    .gte("date", desde)
    .lte("date", hasta);
  if (existentes.error) throw existentes.error;
  const registrados = new Set(existentes.data.map((d) => d.date as string));
  const nuevos = dias.filter((d) => !registrados.has(d));
  if (nuevos.length === 0) {
    throw new ErrorEmpleado(
      dias.length === 1 ? "Ese día ya está registrado como no disponible." : "Todos esos días ya están registrados como no disponibles.",
      409,
    );
  }

  const { error } = await supabase.from("unavailability_users").insert(nuevos.map((date) => ({ id_user: id, date })));
  if (error) throw error;
  return cargarEmpleado(supabase, id);
}

/** Elimina el usuario de auth.users; su perfil y sus indisponibilidades caen en cascada. */
export async function eliminarEmpleado(supabase: SupabaseClient, id: string): Promise<void> {
  await perfilExiste(supabase, id);
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw error;
}
