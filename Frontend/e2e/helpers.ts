import { expect, Page, APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
export const backendPython =
  process.env['BM_E2E_PYTHON'] ||
  resolve(
    process.platform === 'win32'
      ? '../Backend/.venv/Scripts/python.exe'
      : '../Backend/.venv/bin/python',
  );
interface TestUser {
  username: string;
  password: string;
  totp_secret: string;
  recovery_code: string;
}
interface Fixture {
  agenda: {
    date: string;
    professional: number;
    service: number;
    clients: number[];
    appointment: number;
    expired: number;
    qr: number;
    synthetic_only: boolean;
  };
  analytics: {
    sale: number;
    client: number;
    service: number;
    material: number;
    payment: number;
    advance: number;
    desde: string;
    hasta: string;
    synthetic_only: boolean;
  };
  synthetic: boolean;
  catalog: {
    category: number;
    unit: number;
    material: number;
    product: number;
    public_service: number;
    hidden_slug: string;
  };
  inventory: { supplier: number; articles: number[]; unit: number };
  finance: {
    point: number;
    token: string;
    product: number;
    material: number;
    service: number;
    unit: number;
    client: number;
    phone: string;
    advance_sale: number;
    advance: number;
    professional: number;
  };
  backend_port: number;
  control_key: string;
  users: Record<
    | 'admin'
    | 'limited'
    | 'regular'
    | 'second'
    | 'summary'
    | 'clients'
    | 'inventory'
    | 'exporter'
    | 'agenda_reader'
    | 'agenda_manager'
    | 'specialist',
    TestUser
  >;
}
export const fixture: Fixture = JSON.parse(readFileSync(process.env['BM_E2E_FIXTURE']!, 'utf8'));
if (!fixture.synthetic) throw new Error('Synthetic fixture required.');
export function totp(secret: string, offset = 0): string {
  let bits = '';
  for (const char of secret.replace(/=/g, ''))
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0');
  const raw = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const mac = createHmac('sha1', raw).update(counter).digest();
  const point = mac[19]! & 15;
  return ((mac.readUInt32BE(point) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export async function control(request: APIRequestContext, action: string) {
  const response = await request.post(
    'http://127.0.0.1:' + fixture.backend_port + '/__test__/' + action,
    { headers: { 'X-Test-Control': fixture.control_key } },
  );
  expect(response.status()).toBe(200);
}

/** Register the client through the real booking flow before testing arrival by QR. */
export async function bookClientForQr(
  page: Page,
  phone: string,
  nombres: string,
  apellidos: string,
) {
  await control(page.request, 'booking-mode');
  await control(page.request, 'automatic-booking-mode');
  const origin = 'https://localhost:4443';
  await page.request.get(origin + '/api/auth/csrf/');
  const config = await (
    await page.request.get(origin + '/api/v1/public/reservas/configuracion/')
  ).json();
  const available = await (
    await page.request.get(origin + '/api/v1/public/agenda/disponibilidad/', {
      params: {
        profesional_id: fixture.agenda.professional,
        servicios: String(fixture.agenda.service),
        fecha: fixture.agenda.date,
      },
    })
  ).json();
  expect(available.slots.length).toBeGreaterThan(0);
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'csrftoken',
  )!.value;
  const response = await page.request.post(origin + '/api/v1/public/reservas/solicitudes/', {
    data: {
      nombres,
      apellidos,
      telefono: phone,
      profesional_id: fixture.agenda.professional,
      servicios: [fixture.agenda.service],
      inicio_en: available.slots[0].inicio_en,
      consentimiento_datos: true,
      version_aviso: config.privacy_notice.version,
    },
    headers: { 'X-CSRFToken': csrf, 'Idempotency-Key': randomUUID(), Origin: origin },
  });
  expect(response.status(), await response.text()).toBe(201);
  expect((await response.json()).estado).toBe('CONFIRMADA');
}
export type ReportingRole =
  | 'admin'
  | 'limited'
  | 'second'
  | 'summary'
  | 'clients'
  | 'inventory'
  | 'exporter'
  | 'agenda_reader'
  | 'agenda_manager'
  | 'specialist';
export async function firstFactor(page: Page, role: ReportingRole = 'admin') {
  const user = fixture.users[role];
  await page.getByLabel('Usuario', { exact: true }).fill(user.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmemos que eres tú.' })).toBeVisible();
}
export async function login(page: Page, role: ReportingRole = 'admin') {
  await firstFactor(page, role);
  await page.getByLabel('Código de verificación').fill(totp(fixture.users[role].totp_secret));
  await page.getByRole('button', { name: 'Verificar y entrar' }).click();
  await expect(page).toHaveURL(/\/admin/);
}
