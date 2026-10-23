const mqtt = require('mqtt')
const sql = require('mssql')

// =========================
// VALIDACIÓN DE ENV
// =========================
const requiredEnv = [
  'MQTT_URL',
  'MQTT_TOPIC',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SERVER',
  'DB_NAME'
]

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Falta variable de entorno: ${key}`)
    process.exit(1)
  }
})

// =========================
// CONFIG DESDE PM2 (NO .env)
// =========================
const MQTT_URL = process.env.MQTT_URL
const TOPIC = process.env.MQTT_TOPIC

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
  }
}

let pool
const cacheValores = {}

// =========================
// SQL CONNECT
// =========================
async function connectDB() {
  try {
    pool = await sql.connect(sqlConfig)
    console.log('✔ SQL conectado')
  } catch (err) {
    console.error('❌ Error conectando SQL:', err.message)
    process.exit(1)
  }
}

// =========================
// VALIDAR CAMBIO
// =========================
async function debeInsertar(maquina, valor) {
  try {
    // cache primero (rápido)
    if (cacheValores[maquina] === valor) return false

    const result = await pool.request()
      .input('maquina', sql.VarChar, maquina)
      .query(`
        SELECT valor
        FROM sgm_horas_actual
        WHERE maquina = @maquina
      `)

    if (result.recordset.length > 0) {
      const valorDB = Number(result.recordset[0].valor)

      if (valorDB === Number(valor)) {
        cacheValores[maquina] = valor
        return false
      }
    }

    return true

  } catch (err) {
    console.error('❌ Error verificando cambio:', err.message)
    return false
  }
}

// =========================
// GUARDAR DATOS
// =========================
async function guardarMaquina(maquina, valor, topic) {
  const transaction = new sql.Transaction(pool)

  try {
    await transaction.begin()

    const request = new sql.Request(transaction)

    // HISTÓRICO
    await request
      .input('maquina', sql.VarChar, maquina)
      .input('valor', sql.BigInt, valor)
      .input('topic', sql.VarChar, topic)
      .query(`
        INSERT INTO sgm_horas (maquina, valor, topic)
        VALUES (@maquina, @valor, @topic)
      `)

    // ACTUAL (insert + update manual, sin MERGE)
    await request
      .input('maquina2', sql.VarChar, maquina)
      .input('valor2', sql.BigInt, valor)
      .query(`
        UPDATE sgm_horas_actual
        SET valor = @valor2,
            fecha_servidor = GETDATE()
        WHERE maquina = @maquina2;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO sgm_horas_actual (maquina, valor, fecha_servidor)
          VALUES (@maquina2, @valor2, GETDATE());
        END
      `)

    await transaction.commit()

    cacheValores[maquina] = valor

    console.log(`💾 GUARDADO -> ${maquina}: ${valor}`)

  } catch (err) {
    await transaction.rollback()
    console.error('❌ Error guardando:', err.message)
  }
}

// =========================
// MQTT CLIENT
// =========================
const client = mqtt.connect(MQTT_URL)

// conexión
client.on('connect', () => {
  console.log('✔ MQTT conectado')

  client.subscribe(TOPIC, (err) => {
    if (err) {
      console.error('❌ Error suscribiendo:', err.message)
    } else {
      console.log(`📡 Suscripto a: ${TOPIC}`)
    }
  })
})

// reconexión
client.on('reconnect', () => {
  console.log('🔄 Reintentando MQTT...')
})

// error MQTT
client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message)
})

// =========================
// MENSAJES MQTT
// =========================
client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString())

    console.log('📩 MQTT RAW:', data)

    for (const maquina in data) {
      const valor = data[maquina]

      if (typeof valor !== 'number') {
        console.log(`⚠️ Ignorado ${maquina}: valor inválido`)
        continue
      }

      const insertar = await debeInsertar(maquina, valor)

      if (insertar) {
        await guardarMaquina(maquina, valor, topic)
      } else {
        console.log(`⏩ SIN CAMBIO -> ${maquina}`)
      }
    }

  } catch (err) {
    console.error('❌ Error procesando MQTT:', err.message)
  }
})

// =========================
// START
// =========================
connectDB()