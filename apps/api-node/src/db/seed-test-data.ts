#!/usr/bin/env npx tsx
/**
 * Seed script — banco de testes L CASTILHO IMOVEIS.
 *
 * 20 proprietários, 20 inquilinos, 20 imóveis, 20 contratos.
 * Cada pessoa com CPF, email e telefone únicos.
 *
 * Uso:
 *   npx tsx src/db/seed-test-data.ts          # insere dados
 *   npx tsx src/db/seed-test-data.ts --reset  # limpa tudo e re-insere
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// ─── Config ───
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL nao definida. Defina no .env ou exporte.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const db = drizzle(pool, { schema });

// ─── Imobiliária parceira ───

const ORG = {
  name: "L CASTILHO IMOVEIS",
  document: "30.395.589/0001-35",
  smtpSettings: {
    host: "smtppro.zoho.com",
    port: 587,
    user: "lcastilho@lcastilho.com.br",
    pass: "T3WMP0wphzv0",
    from: "lcastilho@lcastilho.com.br",
  },
};

// ─── Admin da imobiliária (único que faz login no sistema) ───
// Proprietários e inquilinos NÃO fazem login.
// Proprietários recebem: extrato de repasse + avisos por email.
// Inquilinos recebem: boleto + avisos por email.

const ADMIN_USER = {
  fullName: "Henrique Scheer de Castilho",
  documentNumber: "847.623.190-72",
  email: "henrique009.hsc@gmail.com",   // email pessoal (recebe boleto/extrato na demo)
  phone: "(11) 99900-0001",
  loginEmail: "lcastilho@lcastilho.com.br",  // email da imobiliária (login no sistema)
  loginPassword: "123@123",
};

// ─── 20 proprietários (CPF, email, telefone únicos) ───
const OWNERS = [
  { fullName: "Maria Aparecida dos Santos",    documentNumber: "319.542.178-06", email: "maria.santos@lcastilho.com.br",     phone: "(11) 99701-1001" },
  { fullName: "José Carlos Ferreira",          documentNumber: "428.653.289-17", email: "jose.ferreira@lcastilho.com.br",    phone: "(11) 99701-1002" },
  { fullName: "Ana Paula Oliveira",            documentNumber: "537.764.390-28", email: "ana.oliveira@lcastilho.com.br",     phone: "(11) 99701-1003" },
  { fullName: "Roberto Almeida Silva",         documentNumber: "646.875.401-39", email: "roberto.silva@lcastilho.com.br",    phone: "(11) 99701-1004" },
  { fullName: "Cláudia Regina Lima",           documentNumber: "755.986.512-40", email: "claudia.lima@lcastilho.com.br",     phone: "(11) 99701-1005" },
  { fullName: "Francisco de Assis Souza",      documentNumber: "864.097.623-51", email: "francisco.souza@lcastilho.com.br",  phone: "(11) 99701-1006" },
  { fullName: "Fernanda Cristina Rocha",       documentNumber: "973.108.734-62", email: "fernanda.rocha@lcastilho.com.br",   phone: "(11) 99701-1007" },
  { fullName: "Antônio Marcos Pereira",        documentNumber: "182.219.845-73", email: "antonio.pereira@lcastilho.com.br",  phone: "(11) 99701-1008" },
  { fullName: "Patrícia Helena Costa",         documentNumber: "291.320.956-84", email: "patricia.costa@lcastilho.com.br",   phone: "(11) 99701-1009" },
  { fullName: "Luiz Fernando Barbosa",         documentNumber: "300.431.067-95", email: "luiz.barbosa@lcastilho.com.br",     phone: "(11) 99701-1010" },
  { fullName: "Sandra Maria Teixeira",         documentNumber: "409.542.178-06", email: "sandra.teixeira@lcastilho.com.br",  phone: "(11) 99701-1011" },
  { fullName: "Ricardo Augusto Mendes",        documentNumber: "518.653.289-17", email: "ricardo.mendes@lcastilho.com.br",   phone: "(11) 99701-1012" },
  { fullName: "Vera Lúcia Nascimento",         documentNumber: "627.764.390-28", email: "vera.nascimento@lcastilho.com.br",  phone: "(11) 99701-1013" },
  { fullName: "Marcos Vinícius Cardoso",       documentNumber: "736.875.401-39", email: "marcos.cardoso@lcastilho.com.br",   phone: "(11) 99701-1014" },
  { fullName: "Rosângela de Fátima Araújo",    documentNumber: "845.986.512-40", email: "rosangela.araujo@lcastilho.com.br", phone: "(11) 99701-1015" },
  { fullName: "Paulo Roberto Cunha",           documentNumber: "954.097.623-51", email: "paulo.cunha@lcastilho.com.br",      phone: "(11) 99701-1016" },
  { fullName: "Eliane Cristina Duarte",        documentNumber: "163.208.734-62", email: "eliane.duarte@lcastilho.com.br",    phone: "(11) 99701-1017" },
  { fullName: "Sérgio Luiz Monteiro",          documentNumber: "272.319.845-73", email: "sergio.monteiro@lcastilho.com.br",  phone: "(11) 99701-1018" },
  { fullName: "Denise Aparecida Fonseca",      documentNumber: "381.420.956-84", email: "denise.fonseca@lcastilho.com.br",   phone: "(11) 99701-1019" },
  { fullName: "Jorge Henrique Medeiros",       documentNumber: "490.531.067-95", email: "jorge.medeiros@lcastilho.com.br",   phone: "(11) 99701-1020" },
];

// ─── 20 inquilinos (CPF, email, telefone únicos) ───
const TENANTS = [
  { fullName: "Pedro Henrique Martins",   documentNumber: "501.642.178-01", email: "henrique009.hsc@gmail.com",    phone: "(11) 98201-2001" },
  { fullName: "Juliana Ribeiro Campos",   documentNumber: "512.753.289-12", email: "juliana.campos@gmail.com",     phone: "(11) 98201-2002" },
  { fullName: "Rafael Augusto Nunes",     documentNumber: "523.864.390-23", email: "rafael.nunes@outlook.com",     phone: "(11) 98201-2003" },
  { fullName: "Camila de Souza Pinto",    documentNumber: "534.975.401-34", email: "camila.pinto@gmail.com",       phone: "(11) 98201-2004" },
  { fullName: "Lucas Gabriel Moreira",    documentNumber: "545.086.512-45", email: "lucas.moreira@hotmail.com",    phone: "(11) 98201-2005" },
  { fullName: "Beatriz Alves Cardoso",    documentNumber: "556.197.623-56", email: "beatriz.cardoso@gmail.com",    phone: "(11) 98201-2006" },
  { fullName: "Thiago Nascimento Reis",   documentNumber: "567.208.734-67", email: "thiago.reis@outlook.com",      phone: "(11) 98201-2007" },
  { fullName: "Larissa Mendes Araújo",    documentNumber: "578.319.845-78", email: "larissa.araujo@gmail.com",     phone: "(11) 98201-2008" },
  { fullName: "Gabriel Santos Teixeira",  documentNumber: "589.420.956-89", email: "gabriel.teixeira@gmail.com",   phone: "(11) 98201-2009" },
  { fullName: "Isabela Freitas Gomes",    documentNumber: "590.531.067-90", email: "isabela.gomes@hotmail.com",    phone: "(11) 98201-2010" },
  { fullName: "Matheus Correia Duarte",   documentNumber: "601.642.178-01", email: "matheus.duarte@gmail.com",     phone: "(11) 98201-2011" },
  { fullName: "Amanda Vieira Lopes",      documentNumber: "612.753.289-12", email: "amanda.lopes@outlook.com",     phone: "(11) 98201-2012" },
  { fullName: "Felipe Ramos Monteiro",    documentNumber: "623.864.390-23", email: "felipe.monteiro@gmail.com",    phone: "(11) 98201-2013" },
  { fullName: "Carolina Dias Machado",    documentNumber: "634.975.401-34", email: "carolina.machado@gmail.com",   phone: "(11) 98201-2014" },
  { fullName: "Gustavo Henrique Borges",  documentNumber: "645.086.512-45", email: "gustavo.borges@hotmail.com",   phone: "(11) 98201-2015" },
  { fullName: "Mariana Castro Azevedo",   documentNumber: "656.197.623-56", email: "mariana.azevedo@gmail.com",    phone: "(11) 98201-2016" },
  { fullName: "Bruno Eduardo Fonseca",    documentNumber: "667.208.734-67", email: "bruno.fonseca@outlook.com",    phone: "(11) 98201-2017" },
  { fullName: "Vanessa Rodrigues Cunha",  documentNumber: "678.319.845-78", email: "vanessa.cunha@gmail.com",      phone: "(11) 98201-2018" },
  { fullName: "Diego Carvalho Medeiros",  documentNumber: "689.420.956-89", email: "diego.medeiros@gmail.com",     phone: "(11) 98201-2019" },
  { fullName: "Aline Gonçalves Barros",   documentNumber: "690.531.067-90", email: "aline.barros@hotmail.com",     phone: "(11) 98201-2020" },
];

// ─── Administradoras de condomínio (fictícias) ───
const CONDO_ADMINS = [
  { name: "Lello Condomínios",           cnpj: "61.064.209/0001-79", phone: "(11) 3147-7000", email: "contato@lello.com.br",           condoFee: "780.00" },
  { name: "Adbens Condomínios",          cnpj: "04.825.673/0001-90", phone: "(11) 3054-3800", email: "financeiro@adbens.com.br",       condoFee: "1250.00" },
  { name: "Habitacional Administradora", cnpj: "52.139.847/0001-33", phone: "(11) 3285-3600", email: "boleto@habitacional.com.br",     condoFee: "650.00" },
  { name: "Graiche Administradora",      cnpj: "47.920.185/0001-12", phone: "(11) 3071-4200", email: "cobranca@graiche.com.br",        condoFee: "920.00" },
  { name: "Itambé Administradora",       cnpj: "61.382.710/0001-05", phone: "(11) 3065-9500", email: "atendimento@itambe.com.br",      condoFee: "850.00" },
  { name: "CIPA Administradora",         cnpj: "33.176.490/0001-87", phone: "(11) 3178-5000", email: "financeiro@cipa.com.br",         condoFee: "1100.00" },
  { name: "Protel Administradora",       cnpj: "58.743.216/0001-48", phone: "(11) 3887-2300", email: "contato@protel.com.br",          condoFee: "580.00" },
  { name: "Sequóia Administradora",      cnpj: "09.451.837/0001-61", phone: "(11) 3034-7100", email: "adm@sequoiacondominios.com.br",  condoFee: "1400.00" },
];

// ─── 20 imóveis (SP capital — bairros variados) ───
// Inscrição imobiliária: prefeitura SP formato 000.000.0000.0-0 (setor.quadra.lote.unidade)
// condoAdminIdx: index into CONDO_ADMINS (null = sem condomínio, ex: casas)
const PROPERTIES: Array<{
  address: string; city: string; state: string; zip: string; type: string;
  areaSqm: string; bedrooms: number; municipalRegistration: string;
  condoAdminIdx: number | null;
}> = [
  { address: "Rua Augusta, 1200 - Apto 31",                     city: "São Paulo", state: "SP", zip: "01304-001", type: "residential", areaSqm: "72.00",  bedrooms: 2, municipalRegistration: "042.035.0128.031-1", condoAdminIdx: 0 },
  { address: "Av. Paulista, 900 - Sala 1401",                   city: "São Paulo", state: "SP", zip: "01310-100", type: "commercial",  areaSqm: "120.00", bedrooms: 0, municipalRegistration: "042.041.0045.140-3", condoAdminIdx: 1 },
  { address: "Rua Oscar Freire, 450 - Apto 82",                 city: "São Paulo", state: "SP", zip: "01426-001", type: "residential", areaSqm: "95.00",  bedrooms: 3, municipalRegistration: "042.028.0072.082-5", condoAdminIdx: 2 },
  { address: "Alameda Santos, 300 - Conj. 51",                  city: "São Paulo", state: "SP", zip: "01418-000", type: "commercial",  areaSqm: "55.00",  bedrooms: 0, municipalRegistration: "042.033.0091.051-8", condoAdminIdx: 3 },
  { address: "Rua Haddock Lobo, 888 - Apto 12",                 city: "São Paulo", state: "SP", zip: "01414-001", type: "residential", areaSqm: "48.00",  bedrooms: 1, municipalRegistration: "042.030.0156.012-2", condoAdminIdx: 4 },
  { address: "Rua da Consolação, 2100 - Apto 44",               city: "São Paulo", state: "SP", zip: "01302-100", type: "residential", areaSqm: "60.00",  bedrooms: 2, municipalRegistration: "042.037.0203.044-7", condoAdminIdx: 0 },
  { address: "Rua Vergueiro, 3500 - Sala 210",                  city: "São Paulo", state: "SP", zip: "04101-300", type: "commercial",  areaSqm: "35.00",  bedrooms: 0, municipalRegistration: "056.012.0087.210-4", condoAdminIdx: 5 },
  { address: "Av. Brasil, 5000 - Casa 3",                       city: "São Paulo", state: "SP", zip: "01430-001", type: "residential", areaSqm: "200.00", bedrooms: 4, municipalRegistration: "042.048.0312.001-9", condoAdminIdx: null },
  { address: "Rua Teodoro Sampaio, 1700 - Apto 63",             city: "São Paulo", state: "SP", zip: "05405-150", type: "residential", areaSqm: "82.00",  bedrooms: 3, municipalRegistration: "063.022.0145.063-6", condoAdminIdx: 2 },
  { address: "Av. Faria Lima, 3200 - Conj. 1802",               city: "São Paulo", state: "SP", zip: "04538-132", type: "commercial",  areaSqm: "90.00",  bedrooms: 0, municipalRegistration: "071.015.0034.180-1", condoAdminIdx: 7 },
  { address: "Rua Pamplona, 518 - Apto 71",                     city: "São Paulo", state: "SP", zip: "01405-000", type: "residential", areaSqm: "68.00",  bedrooms: 2, municipalRegistration: "042.032.0178.071-3", condoAdminIdx: 4 },
  { address: "Av. Rebouças, 1200 - Sala 305",                   city: "São Paulo", state: "SP", zip: "05402-100", type: "commercial",  areaSqm: "42.00",  bedrooms: 0, municipalRegistration: "063.018.0056.305-8", condoAdminIdx: 6 },
  { address: "Rua Bela Cintra, 756 - Apto 54",                  city: "São Paulo", state: "SP", zip: "01415-002", type: "residential", areaSqm: "55.00",  bedrooms: 1, municipalRegistration: "042.029.0134.054-5", condoAdminIdx: 0 },
  { address: "Rua dos Pinheiros, 900 - Apto 22",                city: "São Paulo", state: "SP", zip: "05422-001", type: "residential", areaSqm: "78.00",  bedrooms: 2, municipalRegistration: "063.025.0098.022-2", condoAdminIdx: 2 },
  { address: "Av. Brigadeiro Luís Antônio, 2200 - Conj. 1205",  city: "São Paulo", state: "SP", zip: "01402-000", type: "commercial",  areaSqm: "65.00",  bedrooms: 0, municipalRegistration: "042.039.0067.120-7", condoAdminIdx: 1 },
  { address: "Rua Estados Unidos, 1340 - Apto 41",              city: "São Paulo", state: "SP", zip: "01427-001", type: "residential", areaSqm: "105.00", bedrooms: 3, municipalRegistration: "042.027.0215.041-4", condoAdminIdx: 3 },
  { address: "Rua Funchal, 411 - Sala 1503",                    city: "São Paulo", state: "SP", zip: "04551-060", type: "commercial",  areaSqm: "75.00",  bedrooms: 0, municipalRegistration: "071.019.0023.150-6", condoAdminIdx: 7 },
  { address: "Rua Artur de Azevedo, 1200 - Apto 92",            city: "São Paulo", state: "SP", zip: "05404-003", type: "residential", areaSqm: "88.00",  bedrooms: 3, municipalRegistration: "063.021.0167.092-1", condoAdminIdx: 5 },
  { address: "Av. Santo Amaro, 4500 - Casa 7",                  city: "São Paulo", state: "SP", zip: "04556-100", type: "residential", areaSqm: "180.00", bedrooms: 4, municipalRegistration: "071.034.0289.001-3", condoAdminIdx: null },
  { address: "Rua Joaquim Floriano, 820 - Conj. 701",           city: "São Paulo", state: "SP", zip: "04534-003", type: "commercial",  areaSqm: "50.00",  bedrooms: 0, municipalRegistration: "071.016.0078.701-9", condoAdminIdx: 6 },
];

// Valores de aluguel variados (R$)
const RENT_VALUES = [
  "1800.00", "5500.00", "3200.00", "4500.00", "1500.00",
  "2200.00", "3800.00", "6500.00", "2800.00", "8500.00",
  "2000.00", "3200.00", "1650.00", "2400.00", "7200.00",
  "4800.00", "6000.00", "3100.00", "5200.00", "4200.00",
];

// Dados bancários dos proprietários (20)
const BANK_DATA = [
  { bankCode: "033", branch: "0001", account: "12345-6", accountType: "corrente", pixKey: "maria.santos@lcastilho.com.br" },
  { bankCode: "001", branch: "1234", account: "67890-1", accountType: "corrente", pixKey: "42865328917" },
  { bankCode: "341", branch: "0567", account: "11111-2", accountType: "corrente", pixKey: "ana.oliveira@lcastilho.com.br" },
  { bankCode: "237", branch: "0890", account: "22222-3", accountType: "corrente", pixKey: "64687540139" },
  { bankCode: "104", branch: "0100", account: "33333-4", accountType: "poupanca", pixKey: "claudia.lima@lcastilho.com.br" },
  { bankCode: "033", branch: "0200", account: "44444-5", accountType: "corrente", pixKey: "86409762351" },
  { bankCode: "001", branch: "0300", account: "55555-6", accountType: "corrente", pixKey: "fernanda.rocha@lcastilho.com.br" },
  { bankCode: "341", branch: "0400", account: "66666-7", accountType: "corrente", pixKey: "18221984573" },
  { bankCode: "237", branch: "0500", account: "77777-8", accountType: "corrente", pixKey: "patricia.costa@lcastilho.com.br" },
  { bankCode: "104", branch: "0600", account: "88888-9", accountType: "poupanca", pixKey: "30043106795" },
  { bankCode: "033", branch: "0700", account: "99999-0", accountType: "corrente", pixKey: "sandra.teixeira@lcastilho.com.br" },
  { bankCode: "001", branch: "0800", account: "10101-1", accountType: "corrente", pixKey: "51865328917" },
  { bankCode: "341", branch: "0900", account: "20202-2", accountType: "corrente", pixKey: "vera.nascimento@lcastilho.com.br" },
  { bankCode: "237", branch: "1000", account: "30303-3", accountType: "corrente", pixKey: "73687540139" },
  { bankCode: "104", branch: "1100", account: "40404-4", accountType: "poupanca", pixKey: "rosangela.araujo@lcastilho.com.br" },
  { bankCode: "033", branch: "1200", account: "50505-5", accountType: "corrente", pixKey: "95409762351" },
  { bankCode: "001", branch: "1300", account: "60606-6", accountType: "corrente", pixKey: "eliane.duarte@lcastilho.com.br" },
  { bankCode: "341", branch: "1400", account: "70707-7", accountType: "corrente", pixKey: "27231984573" },
  { bankCode: "237", branch: "1500", account: "80808-8", accountType: "corrente", pixKey: "denise.fonseca@lcastilho.com.br" },
  { bankCode: "104", branch: "1600", account: "90909-9", accountType: "poupanca", pixKey: "49053106795" },
];

// Garantias dos inquilinos
const GUARANTEES = [
  { type: "fiador", details: "Fiador com imovel quitado em SP" },
  { type: "caucao", details: "3 meses de caucao depositados" },
  { type: "seguro_fianca", details: "Seguro fianca Porto Seguro" },
  { type: "titulo_capitalizacao", details: "Titulo SulAmerica" },
  { type: "fiador", details: "Fiador com renda 3x o aluguel" },
];

// ─── Funções ───

async function cleanAll() {
  console.log("Limpando TODOS os dados do banco...");
  await db.delete(schema.messageRecords);
  await db.delete(schema.documents);
  await db.delete(schema.agentTasks);
  await db.delete(schema.integrationConnectors);
  await db.delete(schema.statements);
  await db.delete(schema.payments);
  await db.delete(schema.charges);
  await db.delete(schema.billingSchedules);
  await db.delete(schema.leaseContracts);
  await db.delete(schema.tenants);
  await db.delete(schema.owners);
  await db.delete(schema.properties);
  await db.delete(schema.organizations);
  console.log("  Dados limpos\n");
}

async function seed() {
  const doReset = process.argv.includes("--reset");
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  if (doReset) {
    await cleanAll();
  }

  // 1. Org
  console.log("Criando organizacao...");
  const [org] = await db.insert(schema.organizations).values(ORG).returning();
  console.log(`  Org: ${org.name} | CNPJ: ${ORG.document} | ID: ${org.id}`);

  // 2. Henrique — admin da imobiliária (login) + cadastrado como proprietário e inquilino fictício para demo
  // Na vida real, proprietários/inquilinos NÃO logam. Recebem tudo por email.
  // Aqui usamos o mesmo email só para facilitar a demonstração no hackathon.
  console.log("\n★ Criando Henrique (admin + proprietario ficticio + inquilino ficticio)...");

  const [adminOwner] = await db
    .insert(schema.owners)
    .values({
      orgId: org.id,
      ...ADMIN_USER,
      payoutPreferences: {
        bankCode: "033",
        branch: "0001",
        account: "99000-1",
        accountType: "corrente",
        pixKey: ADMIN_USER.email,
      },
      status: "active",
    })
    .returning();
  console.log(`  ★ Proprietario: ${adminOwner.fullName} | CPF: ${adminOwner.documentNumber} (recebe extrato por email)`);

  const [adminTenant] = await db
    .insert(schema.tenants)
    .values({
      orgId: org.id,
      fullName: ADMIN_USER.fullName,
      documentNumber: ADMIN_USER.documentNumber,
      email: ADMIN_USER.email,
      phone: ADMIN_USER.phone,
      guaranteeProfile: { type: "caucao", details: "3 meses de caucao depositados" },
      status: "active",
    })
    .returning();
  console.log(`  ★ Inquilino:    ${adminTenant.fullName} | CPF: ${adminTenant.documentNumber} (recebe boleto por email)`);

  // 3. 20 proprietários
  console.log("\nCriando 20 proprietarios...");
  const ownerRows = await db
    .insert(schema.owners)
    .values(
      OWNERS.map((o, i) => ({
        orgId: org.id,
        ...o,
        payoutPreferences: BANK_DATA[i],
        status: "active",
      }))
    )
    .returning();
  for (const o of ownerRows) {
    console.log(`  ${o.fullName.padEnd(35)} CPF: ${o.documentNumber}`);
  }

  // 3. 20 inquilinos
  console.log("\nCriando 20 inquilinos...");
  const tenantRows = await db
    .insert(schema.tenants)
    .values(
      TENANTS.map((t, i) => ({
        orgId: org.id,
        ...t,
        guaranteeProfile: GUARANTEES[i % GUARANTEES.length],
        status: "active",
      }))
    )
    .returning();
  for (const t of tenantRows) {
    console.log(`  ${t.fullName.padEnd(35)} CPF: ${t.documentNumber}`);
  }

  // 4. Imóvel do admin (alto padrão)
  console.log("\nCriando imovel do admin...");
  const [adminProperty] = await db
    .insert(schema.properties)
    .values({
      orgId: org.id,
      address: "Rua Jerônimo da Veiga, 384 - Cobertura Duplex",
      city: "São Paulo",
      state: "SP",
      zip: "04536-001",
      type: "residential",
      areaSqm: "420.00",
      bedrooms: 4,
      registryReference: "CRI-SP-14-MAT-287654",
      municipalRegistration: "071.008.0042.001-2",
      condoAdmin: {
        name: "Sequóia Administradora",
        cnpj: "09.451.837/0001-61",
        phone: "(11) 3034-7100",
        email: "adm@sequoiacondominios.com.br",
        condoFee: "2800.00",
      },
      status: "active",
    })
    .returning();
  console.log(`  ★ ${adminProperty.address}`);

  // 5. 20 imóveis (com inscrição imobiliária e administradora de condomínio)
  console.log("\nCriando 20 imoveis...");
  const propertyRows = await db
    .insert(schema.properties)
    .values(
      PROPERTIES.map((p) => ({
        orgId: org.id,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        type: p.type,
        areaSqm: p.areaSqm,
        bedrooms: p.bedrooms,
        municipalRegistration: p.municipalRegistration,
        condoAdmin: p.condoAdminIdx !== null ? CONDO_ADMINS[p.condoAdminIdx] : null,
        status: "active",
      }))
    )
    .returning();
  for (const p of propertyRows) {
    console.log(`  ${p.address}`);
  }

  // 5. 20 contratos — 1 proprietário : 1 inquilino : 1 imóvel
  console.log("\nCriando 20 contratos de locacao...");
  const contractValues = [];
  for (let i = 0; i < 20; i++) {
    // Datas determinísticas: contratos começaram entre 1 e 12 meses atrás
    const monthsAgo = (i % 12) + 1;
    const startDate = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (i % 3 === 0 ? 24 : 12)); // 12 ou 24 meses

    contractValues.push({
      orgId: org.id,
      propertyId: propertyRows[i].id,
      ownerId: ownerRows[i].id,
      tenantId: tenantRows[i].id,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      rentAmount: RENT_VALUES[i],
      depositType: ["caucao", "fiador", "seguro_fianca", "titulo_capitalizacao"][i % 4],
      chargeRules: {
        dueDateDay: [5, 10, 15, 20][i % 4],
        lateFeePercent: "2.00",
        dailyInterestPercent: "0.033",
      },
      payoutRules: {
        adminFeePercent: "10.00",
        payoutDay: [10, 15, 20, 25][i % 4],
      },
      operationalStatus: "active",
    });
  }
  const contractRows = await db.insert(schema.leaseContracts).values(contractValues).returning();
  for (let i = 0; i < contractRows.length; i++) {
    console.log(`  #${String(i + 1).padStart(2, "0")} ${ownerRows[i].fullName.padEnd(30)} -> ${tenantRows[i].fullName.padEnd(28)} R$ ${RENT_VALUES[i]}`);
  }

  // Contratos do Henrique (demo)
  console.log("\n★ Criando contratos do Henrique (demo)...");

  // Henrique como PROPRIETARIO da cobertura duplex → inquilino fictício
  const [adminAsOwnerContract] = await db
    .insert(schema.leaseContracts)
    .values({
      orgId: org.id,
      propertyId: adminProperty.id,
      ownerId: adminOwner.id,
      tenantId: tenantRows[0].id, // primeiro inquilino aluga a cobertura
      startDate: new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().split("T")[0],
      endDate: new Date(today.getFullYear(), today.getMonth() + 21, 1).toISOString().split("T")[0],
      rentAmount: "12500.00",
      depositType: "caucao",
      chargeRules: { dueDateDay: 10, lateFeePercent: "2.00", dailyInterestPercent: "0.033" },
      payoutRules: { adminFeePercent: "10.00", payoutDay: 15 },
      operationalStatus: "active",
    })
    .returning();
  console.log(`  ★ Proprietario: ${ADMIN_USER.fullName} → Inquilino: ${tenantRows[0].fullName} | R$ 12.500,00`);

  // Henrique como INQUILINO em imóvel de alto padrão
  const [adminAsTenantContract] = await db
    .insert(schema.leaseContracts)
    .values({
      orgId: org.id,
      propertyId: propertyRows[2].id, // Rua Oscar Freire, 450 - Apto 82
      ownerId: ownerRows[2].id,       // Ana Paula Oliveira
      tenantId: adminTenant.id,
      startDate: new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString().split("T")[0],
      endDate: new Date(today.getFullYear(), today.getMonth() + 18, 1).toISOString().split("T")[0],
      rentAmount: "4200.00",
      depositType: "seguro_fianca",
      chargeRules: { dueDateDay: 5, lateFeePercent: "2.00", dailyInterestPercent: "0.033" },
      payoutRules: { adminFeePercent: "10.00", payoutDay: 10 },
      operationalStatus: "active",
    })
    .returning();
  console.log(`  ★ Inquilino: ${ADMIN_USER.fullName} → Proprietaria: ${ownerRows[2].fullName} | R$ 4.200,00`);

  // 6. Billing schedules (todos os 22 contratos — 20 base + 2 Henrique)
  console.log("\nCriando billing schedules...");
  const allContracts = [...contractRows, adminAsOwnerContract, adminAsTenantContract];
  const allRentAmounts = [...RENT_VALUES, "12500.00", "4200.00"];
  const scheduleValues = allContracts.map((c, i) => ({
    orgId: org.id,
    leaseContractId: c.id,
    dueDateRule: ["first_business_day", "fixed_day_5", "fixed_day_10", "fixed_day_15"][i % 4],
    chargeComponents: [
      { type: "rent", source: "contract", fixedAmount: c.rentAmount },
      ...(i % 3 === 0 ? [{ type: "condominium", source: "document", fixedAmount: "780.00" }] : []),
      ...(i % 5 === 0 ? [{ type: "iptu", source: "document", fixedAmount: "450.00" }] : []),
    ],
    collectionMethod: i % 3 === 0 ? "boleto" : "boleto_pix",
    lateFeeRule: { percentage: "2.00" },
    interestRule: { dailyPercentage: "0.033" },
    status: "active",
  }));
  const scheduleRows = await db.insert(schema.billingSchedules).values(scheduleValues).returning();
  console.log(`  ${scheduleRows.length} billing schedules criados (incl. 2 do Henrique)`);

  // 7. Cobranças históricas (últimos 5 meses — todos pagos) + mês atual
  // Gera dados para o gráfico de tendência de 6 meses do dashboard
  console.log("\nGerando cobrancas dos ultimos 6 meses...");

  const allChargeValues: Array<{
    orgId: string;
    leaseContractId: string;
    billingPeriod: string;
    lineItems: Array<{ type: string; description: string; amount: string; source: string }>;
    grossAmount: string;
    discountAmount: string;
    penaltyAmount: string;
    netAmount: string;
    issueStatus: string;
    paymentStatus: string;
    dueDate: string;
  }> = [];

  // Helper: build charge for a contract
  function buildCharge(c: typeof allContracts[0], i: number, period: string, status: "paid" | "overdue" | "open") {
    const rent = parseFloat(c.rentAmount);
    const condo = i % 3 === 0 ? 780 : 0;
    const iptu = i % 5 === 0 ? 450 : 0;
    const gross = rent + condo + iptu;

    return {
      orgId: org.id,
      leaseContractId: c.id,
      billingPeriod: period,
      lineItems: [
        { type: "rent", description: "Aluguel", amount: c.rentAmount, source: "contract" },
        ...(condo ? [{ type: "condominium", description: "Condominio", amount: "780.00", source: "document" }] : []),
        ...(iptu ? [{ type: "iptu", description: "IPTU", amount: "450.00", source: "document" }] : []),
      ],
      grossAmount: gross.toFixed(2),
      discountAmount: "0.00",
      penaltyAmount: status === "overdue" ? (gross * 0.02).toFixed(2) : "0.00",
      netAmount: status === "overdue" ? (gross * 1.02).toFixed(2) : gross.toFixed(2),
      issueStatus: "issued",
      paymentStatus: status,
      dueDate: `${period}-${String([5, 10, 15, 20][i % 4]).padStart(2, "0")}`,
    };
  }

  // Past 5 months — all paid (populates trend chart)
  for (let m = 5; m >= 1; m--) {
    const pastDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const pastMonth = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, "0")}`;
    for (let i = 0; i < allContracts.length; i++) {
      allChargeValues.push(buildCharge(allContracts[i], i, pastMonth, "paid"));
    }
  }

  // Current month — mix realista: 15 paid, 3 overdue, 4 open (total 22)
  for (let i = 0; i < allContracts.length; i++) {
    let status: "paid" | "overdue" | "open";
    if (i < 15) {
      status = "paid";
    } else if (i < 18) {
      status = "overdue";
    } else {
      status = "open";
    }
    allChargeValues.push(buildCharge(allContracts[i], i, currentMonth, status));
  }

  const chargeRows = await db.insert(schema.charges).values(allChargeValues).returning();
  const paid = chargeRows.filter((c) => c.paymentStatus === "paid");
  const overdue = chargeRows.filter((c) => c.paymentStatus === "overdue");
  const open = chargeRows.filter((c) => c.paymentStatus === "open");
  console.log(`  ${chargeRows.length} cobrancas total (6 meses)`);
  console.log(`  Mes atual: ${paid.filter(c => c.billingPeriod === currentMonth).length} pagas, ${overdue.length} atrasadas, ${open.length} em aberto`);
  console.log(`  Meses anteriores: ${paid.filter(c => c.billingPeriod !== currentMonth).length} pagas (historico)`);

  // 8. Pagamentos (todos os pagos)
  console.log("\nRegistrando pagamentos...");
  if (paid.length > 0) {
    const paymentValues = paid.map((c, i) => {
      // For historical months, payment on day 3-7 of that month; for current month, same
      const period = c.billingPeriod;
      const [year, month] = period.split("-").map(Number);
      return {
        orgId: org.id,
        chargeId: c.id,
        receivedAmount: c.netAmount,
        receivedAt: new Date(year, month - 1, [3, 4, 5, 6, 7][i % 5]),
        paymentMethod: i % 2 === 0 ? "pix" : "boleto",
        bankReference: `LCASTILHO-${period}-${String(i + 1).padStart(3, "0")}`,
        reconciliationStatus: "matched",
      };
    });
    const paymentRows = await db.insert(schema.payments).values(paymentValues).returning();
    console.log(`  ${paymentRows.length} pagamentos registrados`);
  }

  // ─── Resumo ───
  console.log("\n" + "=".repeat(60));
  console.log(" BANCO DE TESTES — L CASTILHO IMOVEIS");
  console.log("=".repeat(60));
  console.log(`  Organizacao:    ${org.name} (${ORG.document})`);
  console.log(`  Admin:          ${ADMIN_USER.fullName} (${ADMIN_USER.email})`);
  console.log(`  Proprietarios:  ${ownerRows.length + 1} (incl. admin)`);
  console.log(`  Inquilinos:     ${tenantRows.length}`);
  console.log(`  Imoveis:        ${propertyRows.length + 1} (incl. admin)`);
  console.log(`  Contratos:      ${contractRows.length + 2} (incl. 2 do Henrique)`);
  console.log(`  Schedules:      ${scheduleRows.length}`);
  console.log(`  Cobrancas:      ${chargeRows.length} (${paid.length} pagas, ${overdue.length} atrasadas, ${open.length} abertas)`);
  console.log(`  Pagamentos:     ${paid.length}`);
  console.log(`\n  Org ID: ${org.id}`);
  console.log(`  Login (admin): ${ADMIN_USER.loginEmail} / ${ADMIN_USER.loginPassword}`);
  console.log(`  Email demo:    ${ADMIN_USER.email} (recebe boleto/extrato)`);
  console.log(`  Proprietarios/inquilinos NAO logam — recebem tudo por email.`);
  console.log("=".repeat(60));
}

seed()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Erro no seed:", err);
    pool.end();
    process.exit(1);
  });
