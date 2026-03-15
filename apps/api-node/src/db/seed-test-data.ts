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
  { fullName: "Pedro Henrique Martins",   documentNumber: "501.642.178-01", email: "pedro.martins@gmail.com",      phone: "(11) 98201-2001" },
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

// ─── 20 imóveis (SP capital — bairros variados) ───
const PROPERTIES = [
  { address: "Rua Augusta, 1200 - Apto 31",                     city: "São Paulo", state: "SP", zip: "01304-001", type: "residential", areaSqm: "72.00",  bedrooms: 2 },
  { address: "Av. Paulista, 900 - Sala 1401",                   city: "São Paulo", state: "SP", zip: "01310-100", type: "commercial",  areaSqm: "120.00", bedrooms: 0 },
  { address: "Rua Oscar Freire, 450 - Apto 82",                 city: "São Paulo", state: "SP", zip: "01426-001", type: "residential", areaSqm: "95.00",  bedrooms: 3 },
  { address: "Alameda Santos, 300 - Conj. 51",                  city: "São Paulo", state: "SP", zip: "01418-000", type: "commercial",  areaSqm: "55.00",  bedrooms: 0 },
  { address: "Rua Haddock Lobo, 888 - Apto 12",                 city: "São Paulo", state: "SP", zip: "01414-001", type: "residential", areaSqm: "48.00",  bedrooms: 1 },
  { address: "Rua da Consolação, 2100 - Apto 44",               city: "São Paulo", state: "SP", zip: "01302-100", type: "residential", areaSqm: "60.00",  bedrooms: 2 },
  { address: "Rua Vergueiro, 3500 - Sala 210",                  city: "São Paulo", state: "SP", zip: "04101-300", type: "commercial",  areaSqm: "35.00",  bedrooms: 0 },
  { address: "Av. Brasil, 5000 - Casa 3",                       city: "São Paulo", state: "SP", zip: "01430-001", type: "residential", areaSqm: "200.00", bedrooms: 4 },
  { address: "Rua Teodoro Sampaio, 1700 - Apto 63",             city: "São Paulo", state: "SP", zip: "05405-150", type: "residential", areaSqm: "82.00",  bedrooms: 3 },
  { address: "Av. Faria Lima, 3200 - Conj. 1802",               city: "São Paulo", state: "SP", zip: "04538-132", type: "commercial",  areaSqm: "90.00",  bedrooms: 0 },
  { address: "Rua Pamplona, 518 - Apto 71",                     city: "São Paulo", state: "SP", zip: "01405-000", type: "residential", areaSqm: "68.00",  bedrooms: 2 },
  { address: "Av. Rebouças, 1200 - Sala 305",                   city: "São Paulo", state: "SP", zip: "05402-100", type: "commercial",  areaSqm: "42.00",  bedrooms: 0 },
  { address: "Rua Bela Cintra, 756 - Apto 54",                  city: "São Paulo", state: "SP", zip: "01415-002", type: "residential", areaSqm: "55.00",  bedrooms: 1 },
  { address: "Rua dos Pinheiros, 900 - Apto 22",                city: "São Paulo", state: "SP", zip: "05422-001", type: "residential", areaSqm: "78.00",  bedrooms: 2 },
  { address: "Av. Brigadeiro Luís Antônio, 2200 - Conj. 1205",  city: "São Paulo", state: "SP", zip: "01402-000", type: "commercial",  areaSqm: "65.00",  bedrooms: 0 },
  { address: "Rua Estados Unidos, 1340 - Apto 41",              city: "São Paulo", state: "SP", zip: "01427-001", type: "residential", areaSqm: "105.00", bedrooms: 3 },
  { address: "Rua Funchal, 411 - Sala 1503",                    city: "São Paulo", state: "SP", zip: "04551-060", type: "commercial",  areaSqm: "75.00",  bedrooms: 0 },
  { address: "Rua Artur de Azevedo, 1200 - Apto 92",            city: "São Paulo", state: "SP", zip: "05404-003", type: "residential", areaSqm: "88.00",  bedrooms: 3 },
  { address: "Av. Santo Amaro, 4500 - Casa 7",                  city: "São Paulo", state: "SP", zip: "04556-100", type: "residential", areaSqm: "180.00", bedrooms: 4 },
  { address: "Rua Joaquim Floriano, 820 - Conj. 701",           city: "São Paulo", state: "SP", zip: "04534-003", type: "commercial",  areaSqm: "50.00",  bedrooms: 0 },
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

// Tickets de manutenção
const MAINTENANCE_TICKETS = [
  { description: "Vazamento no teto do banheiro, mancha de umidade crescente", category: "plumbing", priority: "high" as const },
  { description: "Ar condicionado nao liga, fusivel queimado", category: "electrical", priority: "medium" as const },
  { description: "Fechadura da porta principal emperrada", category: "general", priority: "high" as const },
  { description: "Infiltracao na parede da sala, proximo a janela", category: "plumbing", priority: "high" as const },
  { description: "Piso laminado soltando no quarto 2", category: "general", priority: "low" as const },
  { description: "Torneira da cozinha pingando constantemente", category: "plumbing", priority: "medium" as const },
  { description: "Portao da garagem nao abre com controle remoto", category: "electrical", priority: "medium" as const },
  { description: "Vidro da janela da sala trincado", category: "general", priority: "low" as const },
  { description: "Descarga do vaso sanitario nao para de correr", category: "plumbing", priority: "high" as const },
  { description: "Tomada do quarto soltando faisca", category: "electrical", priority: "high" as const },
];

// ─── Funções ───

async function cleanAll() {
  console.log("Limpando TODOS os dados do banco...");
  await db.delete(schema.maintenanceTickets);
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

  // 2. 20 proprietários
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

  // 4. 20 imóveis
  console.log("\nCriando 20 imoveis...");
  const propertyRows = await db
    .insert(schema.properties)
    .values(
      PROPERTIES.map((p) => ({
        orgId: org.id,
        ...p,
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

  // 6. Billing schedules (todos os 20)
  console.log("\nCriando billing schedules...");
  const scheduleValues = contractRows.map((c, i) => ({
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
  console.log(`  ${scheduleRows.length} billing schedules criados`);

  // 7. Cobranças do mês atual (20)
  console.log("\nGerando cobrancas do mes atual (${currentMonth})...");
  const chargeValues = contractRows.map((c, i) => {
    const rent = parseFloat(c.rentAmount);
    const condo = i % 3 === 0 ? 780 : 0;
    const iptu = i % 5 === 0 ? 450 : 0;
    const gross = rent + condo + iptu;

    // Mix de status realista: 5 pagos, 3 atrasados, 12 em aberto
    let issueStatus: string;
    let paymentStatus: string;
    if (i < 5) {
      issueStatus = "issued"; paymentStatus = "paid";
    } else if (i < 8) {
      issueStatus = "issued"; paymentStatus = "overdue";
    } else {
      issueStatus = "issued"; paymentStatus = "open";
    }

    return {
      orgId: org.id,
      leaseContractId: c.id,
      billingPeriod: currentMonth,
      lineItems: [
        { type: "rent", description: "Aluguel", amount: c.rentAmount, source: "contract" },
        ...(condo ? [{ type: "condominium", description: "Condominio", amount: "780.00", source: "document" }] : []),
        ...(iptu ? [{ type: "iptu", description: "IPTU", amount: "450.00", source: "document" }] : []),
      ],
      grossAmount: gross.toFixed(2),
      discountAmount: "0.00",
      penaltyAmount: paymentStatus === "overdue" ? (gross * 0.02).toFixed(2) : "0.00",
      netAmount: paymentStatus === "overdue" ? (gross * 1.02).toFixed(2) : gross.toFixed(2),
      issueStatus,
      paymentStatus,
      dueDate: `${currentMonth}-${String([5, 10, 15, 20][i % 4]).padStart(2, "0")}`,
    };
  });
  const chargeRows = await db.insert(schema.charges).values(chargeValues).returning();
  const paid = chargeRows.filter((c) => c.paymentStatus === "paid");
  const overdue = chargeRows.filter((c) => c.paymentStatus === "overdue");
  const open = chargeRows.filter((c) => c.paymentStatus === "open");
  console.log(`  ${chargeRows.length} cobrancas: ${paid.length} pagas, ${overdue.length} atrasadas, ${open.length} em aberto`);

  // 8. Pagamentos (5 pagos)
  console.log("\nRegistrando pagamentos...");
  if (paid.length > 0) {
    const paymentValues = paid.map((c, i) => ({
      orgId: org.id,
      chargeId: c.id,
      receivedAmount: c.netAmount,
      receivedAt: new Date(today.getFullYear(), today.getMonth(), [3, 4, 5, 6, 7][i % 5]),
      paymentMethod: i % 2 === 0 ? "pix" : "boleto",
      bankReference: `LCASTILHO-${currentMonth}-${String(i + 1).padStart(3, "0")}`,
      reconciliationStatus: "matched",
    }));
    const paymentRows = await db.insert(schema.payments).values(paymentValues).returning();
    console.log(`  ${paymentRows.length} pagamentos (${paymentRows.filter((p) => p.paymentMethod === "pix").length} PIX, ${paymentRows.filter((p) => p.paymentMethod === "boleto").length} boleto)`);
  }

  // 9. Tickets de manutenção
  console.log("\nCriando tickets de manutencao...");
  const ticketValues = MAINTENANCE_TICKETS.map((t, i) => ({
    orgId: org.id,
    propertyId: propertyRows[i % 20].id,
    leaseContractId: contractRows[i % 20].id,
    openedBy: tenantRows[i % 20].fullName,
    category: t.category,
    priority: t.priority,
    status: ["open", "in_progress", "resolved", "open", "open"][i % 5],
    description: t.description,
    resolutionSummary: i % 5 === 2 ? "Problema resolvido pelo tecnico no local." : null,
  }));
  const ticketRows = await db.insert(schema.maintenanceTickets).values(ticketValues).returning();
  console.log(`  ${ticketRows.length} tickets criados`);

  // ─── Resumo ───
  console.log("\n" + "=".repeat(60));
  console.log(" BANCO DE TESTES — L CASTILHO IMOVEIS");
  console.log("=".repeat(60));
  console.log(`  Organizacao:    ${org.name} (${ORG.document})`);
  console.log(`  Proprietarios:  ${ownerRows.length}`);
  console.log(`  Inquilinos:     ${tenantRows.length}`);
  console.log(`  Imoveis:        ${propertyRows.length}`);
  console.log(`  Contratos:      ${contractRows.length}`);
  console.log(`  Schedules:      ${scheduleRows.length}`);
  console.log(`  Cobrancas:      ${chargeRows.length} (${paid.length} pagas, ${overdue.length} atrasadas, ${open.length} abertas)`);
  console.log(`  Pagamentos:     ${paid.length}`);
  console.log(`  Tickets:        ${ticketRows.length}`);
  console.log(`\n  Org ID: ${org.id}`);
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
