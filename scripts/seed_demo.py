#!/usr/bin/env python3
"""
Seed script for Real Estate OS hackathon demo.
Usage:
  python scripts/seed_demo.py           # seed demo data
  python scripts/seed_demo.py --reset   # reset then seed
"""

import json
import sys
import urllib.request
import urllib.error
from datetime import date, timedelta

BASE_URL = "http://localhost:8000/api"


def post(path: str, body: dict | None = None, multipart: bool = False) -> dict:
    url = f"{BASE_URL}{path}"
    if multipart:
        # simple multipart for file upload
        boundary = "boundary123"
        lines = []
        for key, value in body.items():
            if key == "__file__":
                continue
            lines.append(f"--{boundary}".encode())
            lines.append(f'Content-Disposition: form-data; name="{key}"'.encode())
            lines.append(b"")
            lines.append(str(value).encode())
        # fake file
        lines.append(f"--{boundary}".encode())
        lines.append(b'Content-Disposition: form-data; name="file"; filename="demo.pdf"')
        lines.append(b"Content-Type: application/pdf")
        lines.append(b"")
        lines.append(b"%PDF-1.4 fake demo file content")
        lines.append(f"--{boundary}--".encode())
        data = b"\r\n".join(lines)
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
    elif body is not None:
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
    else:
        req = urllib.request.Request(url, method="POST")

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        print(f"  ❌ HTTP {e.code} em {path}: {body_text}")
        sys.exit(1)


def step(label: str, result: dict, key: str = "id") -> str:
    rid = result.get(key, "?")
    print(f"  ✅ {label}: {rid}")
    return str(rid)


def reset():
    print("🔄 Resetando dados de demo...")
    result = post("/demo/reset")
    print(f"  ✅ Reset completo para tenant: {result.get('tenant_id')}")


def seed():
    today = date.today()
    ref_month = date(today.year, today.month, 1)

    print("\n📦 Criando proprietário...")
    owner = post("/owners", {
        "name": "Maria Demo Souza",
        "document": "111.222.333-44",
        "email": "maria.demo@realestateos.com.br",
        "phone": "(11) 99999-1111",
    })
    owner_id = step("Owner criado", owner)

    print("\n🏠 Criando imóvel...")
    property_ = post("/properties", {
        "address": "Rua da Demo, 100 - Apto 42",
        "city": "São Paulo",
        "state": "SP",
        "zip": "01310-100",
        "owner_id": owner_id,
        "iptu_registration_number": "IPTU-DEMO-2026",
    })
    property_id = step("Property criada", property_)

    print("\n👤 Criando inquilino...")
    renter = post("/renters", {
        "name": "João Demo Lima",
        "document": "555.666.777-88",
        "email": "joao.demo@inquilino.com.br",
        "phone": "(11) 98888-2222",
    })
    renter_id = step("Renter criado", renter)

    print("\n📝 Criando contrato...")
    start = ref_month
    end = date(ref_month.year + 1, ref_month.month, ref_month.day) - timedelta(days=1)
    contract = post("/contracts", {
        "property_id": property_id,
        "renter_id": renter_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "monthly_rent": "2500.00",
        "due_day": 10,
    })
    contract_id = step("Contract criado", contract)

    print("\n💰 Gerando cobrança mensal de aluguel...")
    charges = post("/charges/generate-monthly", {
        "contract_id": contract_id,
        "reference_month": ref_month.isoformat(),
    })
    if isinstance(charges, list) and charges:
        step("Charge(s) gerada(s)", charges[0])
    else:
        print("  ❌ Nenhuma charge gerada")
        sys.exit(1)

    print("\n📄 Fazendo upload do boleto de IPTU...")
    post("/documents/upload", {
        "property_id": property_id,
        "type": "IPTU",
        "extracted_amount": "450.00",
        "extracted_due_date": (ref_month + timedelta(days=9)).isoformat(),
    }, multipart=True)
    print("  ✅ Documento IPTU enviado")

    print("\n📄 Fazendo upload do boleto de Condomínio...")
    post("/documents/upload", {
        "property_id": property_id,
        "type": "CONDO",
        "extracted_amount": "780.00",
        "extracted_due_date": (ref_month + timedelta(days=9)).isoformat(),
    }, multipart=True)
    print("  ✅ Documento CONDO enviado")

    print("\n🔀 Consolidando cobranças do mês...")
    consolidated = post("/charges/consolidate", {
        "contract_id": contract_id,
        "reference_month": ref_month.isoformat(),
    })
    consolidated_id = step("Cobrança consolidada", consolidated)

    print("\n🏦 Gerando boleto/PIX...")
    payment = post(f"/charges/{consolidated_id}/generate-payment")
    provider = payment.get("provider", "?")
    print(f"  ✅ Pagamento gerado via: {provider.upper()}")
    print(f"     Boleto: {payment.get('boleto_url')}")
    print(f"     PIX: {payment.get('pix_qrcode')}")

    print("\n🎉 Demo seed completo! Abra http://localhost:3000 para ver o dashboard.\n")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
    seed()
