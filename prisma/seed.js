import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean
  await prisma.notification.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.report.deleteMany();
  await prisma.document.deleteMany();
  await prisma.rentalRequest.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // Org demo
  const org = await prisma.organization.create({
    data: {
      name: 'Al Volante GDL',
      slug: 'al-volante-gdl',
      plan: 'pro',
      phone: '+52 333 332 4037',
      rfc: 'AVG240101ABC'
    }
  });

  // Users
  const adminPass = await bcrypt.hash('demo123', 10);
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'jp@solventaburo.com',
      passwordHash: adminPass,
      name: 'Juan Pablo Fierro',
      phone: '+52 333 332 4037',
      role: 'admin'
    }
  });
  const asesor = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'lucia@solventaburo.com',
      passwordHash: await bcrypt.hash('demo123', 10),
      name: 'Lucía Ramírez',
      phone: '+52 333 111 2222',
      role: 'asesor'
    }
  });

  // Tenants
  const tenantsSeed = [
    { fullName:'Carlos Ramírez García', email:'carlos.r@gmail.com', phone:'+52 33 1234 5678', rfc:'RAGC850612A12', curp:'RAGC850612HJCXXX01', dob:'1985-06-12', occupation:'Director Comercial', employer:'Innovatech SA de CV', monthlyIncome:65000, tenure:'4 años' },
    { fullName:'María González Pérez', email:'maria.gp@hotmail.com', phone:'+52 33 9876 5432', rfc:'GOPM910305B34', curp:'GOPM910305MJCXXX02', dob:'1991-03-05', occupation:'Diseñadora Senior', employer:'Estudio Diseñar', monthlyIncome:42000, tenure:'2 años' },
    { fullName:'Juan López Mendoza', email:'jl.mendoza@outlook.com', phone:'+52 55 1122 3344', rfc:'LOMJ780820C56', curp:'LOMJ780820HDFXXX03', dob:'1978-08-20', occupation:'Consultor Independiente', employer:'Freelance', monthlyIncome:38000, tenure:'6 años' },
    { fullName:'Ana Sofía Hernández', email:'ana.sofia@correo.mx', phone:'+52 81 5566 7788', rfc:'HEAS940715D78', curp:'HEAS940715MNLXXX04', dob:'1994-07-15', occupation:'Médico residente', employer:'Hospital San Javier', monthlyIncome:32000, tenure:'3 años' },
    { fullName:'Roberto Mejía Castro', email:'rmejia@empresa.com', phone:'+52 33 2233 4455', rfc:'MECR820925E90', curp:'MECR820925HJCXXX05', dob:'1982-09-25', occupation:'Gerente Regional', employer:'Distribuidora Nacional', monthlyIncome:78000, tenure:'7 años' }
  ];
  const tenants = [];
  for (const t of tenantsSeed) {
    tenants.push(await prisma.tenant.create({ data: { ...t, organizationId: org.id }}));
  }

  // Requests
  const reqsSeed = [
    { tenant: tenants[0], propertyAddress:'Av. de las Palmas 421, Polanco, CDMX', monthlyRent:28000, plan:'premium', status:'validado', progress:100, withFiador:false },
    { tenant: tenants[1], propertyAddress:'Av. Vallarta 3050, Providencia, GDL', monthlyRent:18500, plan:'multiproteccion', status:'revision', progress:65, withFiador:true },
    { tenant: tenants[2], propertyAddress:'Calzada del Valle 110, San Pedro, MTY', monthlyRent:42000, plan:'premium', status:'rechazado', progress:100, withFiador:false },
    { tenant: tenants[3], propertyAddress:'Av. Acueducto 5040, Zapopan, JAL', monthlyRent:22000, plan:'multireporte', status:'nuevo', progress:20, withFiador:false },
    { tenant: tenants[4], propertyAddress:'Bosques de Reforma 880, CDMX', monthlyRent:55000, plan:'premium', status:'validado', progress:100, withFiador:true }
  ];

  const reqs = [];
  for (const r of reqsSeed) {
    const req = await prisma.rentalRequest.create({
      data: {
        organizationId: org.id,
        tenantId: r.tenant.id,
        createdById: admin.id,
        propertyAddress: r.propertyAddress,
        monthlyRent: r.monthlyRent,
        plan: r.plan,
        withFiador: r.withFiador,
        status: r.status,
        progress: r.progress,
        validatedAt: r.status === 'validado' ? new Date() : null
      }
    });
    reqs.push(req);

    // Docs
    const docTypes = ['ine','domicilio','ingresos','banco','referencias','empleo'];
    for (const type of docTypes) {
      const docStatus = r.status === 'validado' ? 'validado' : r.status === 'rechazado' ? 'rechazado' : r.progress >= 50 ? 'validado' : 'revision';
      await prisma.document.create({
        data: {
          requestId: req.id, type,
          filename: `${type}.pdf`, storagePath: `/uploads/seed/${type}.pdf`,
          mimeType: 'application/pdf', size: 102400,
          status: docStatus
        }
      });
    }

    // Reports
    if (r.status === 'validado' || r.status === 'rechazado') {
      const score = r.status === 'validado' ? (80 + Math.floor(Math.random()*15)) : 35 + Math.floor(Math.random()*15);
      await prisma.report.create({
        data: {
          requestId: req.id,
          score,
          identityOk: true,
          creditOk: score >= 60,
          legalOk: score >= 50,
          blacklistOk: score >= 50,
          fraudRisk: score >= 80 ? 'low' : score >= 60 ? 'medium' : 'high',
          capacityRatio: Number((r.tenant.monthlyIncome / r.monthlyRent).toFixed(2)),
          observations: score >= 80 ? '✅ Excelente candidato' : '⚠️ Capacidad ajustada',
          rawData: JSON.stringify({ score })
        }
      });
    }
  }

  // Contratos para validados
  for (const r of reqs.filter(r => r.status === 'validado')) {
    const start = new Date(); const end = new Date(start); end.setFullYear(end.getFullYear()+1);
    await prisma.contract.create({
      data: {
        organizationId: org.id,
        requestId: r.id,
        tenantId: r.tenantId,
        startDate: start.toISOString().slice(0,10),
        endDate: end.toISOString().slice(0,10),
        monthlyRent: r.monthlyRent,
        deposit: r.monthlyRent,
        status: 'activo',
        signedAt: new Date(),
        contractData: JSON.stringify({ plan: r.plan })
      }
    });
    if (r.plan !== 'multireporte') {
      await prisma.policy.create({
        data: {
          organizationId: org.id, requestId: r.id, plan: r.plan,
          coverage: r.monthlyRent * 12,
          startDate: start.toISOString().slice(0,10),
          endDate: end.toISOString().slice(0,10),
          status: 'activa',
          policyNumber: 'POL-' + Date.now().toString().slice(-7) + Math.floor(Math.random()*99)
        }
      });
    }
  }

  // Payments
  const planPrice = { multireporte:999, multiproteccion:4600, premium:7500 };
  for (const r of reqs) {
    const status = r.status === 'rechazado' ? 'paid' : (r.status === 'nuevo' ? 'pending' : 'paid');
    await prisma.payment.create({
      data: {
        organizationId: org.id, requestId: r.id,
        concept: `${r.plan} · ${tenants.find(t=>t.id===r.tenantId).fullName}`,
        amount: planPrice[r.plan] + (r.withFiador ? 299 : 0),
        method: 'card', status,
        reference: status === 'paid' ? 'ch_' + Math.random().toString(36).slice(2,12) : null,
        paidAt: status === 'paid' ? new Date() : null
      }
    });
  }

  // Activity
  const acts = [
    { action:'request.validado', icon:'✅', description: `<strong>Carlos Ramírez</strong> validado con score 92` },
    { action:'contract.signed', icon:'📄', description: `Contrato firmado para <strong>Bosques de Reforma 880</strong>` },
    { action:'request.rejected', icon:'❌', description: `<strong>Juan López</strong> rechazado por historial crediticio` },
    { action:'document.uploaded', icon:'📎', description: `<strong>María González</strong> subió comprobante de ingresos` },
    { action:'payment.captured', icon:'💳', description: `Pago confirmado por <strong>$7,500 MXN</strong>` },
    { action:'org.created', icon:'🏢', description: `Organización <strong>Al Volante GDL</strong> creada` }
  ];
  for (const a of acts) {
    await prisma.activity.create({
      data: { organizationId: org.id, userId: admin.id, entityType: 'request', ...a }
    });
  }

  console.log('✅ Seed completo:');
  console.log(`   Organización: ${org.name} (${org.id})`);
  console.log(`   Admin: jp@solventaburo.com / demo123`);
  console.log(`   Asesor: lucia@solventaburo.com / demo123`);
  console.log(`   ${tenants.length} inquilinos · ${reqs.length} solicitudes`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
