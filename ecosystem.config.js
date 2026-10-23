module.exports = {
  apps: [
    {
      // =========================
      // INFO APP
      // =========================
      name: "mqtt-app",
      script: "server.js",
      cwd: "C:/proyectos/MQTT",

      // =========================
      // MODO EJECUCION
      // =========================
      exec_mode: "fork",
      instances: 1,

      // =========================
      // RESTART / ESTABILIDAD
      // =========================
      autorestart: true,
      watch: false,

      max_restarts: 10,
      restart_delay: 5000,

      min_uptime: "10s",

      listen_timeout: 10000,
      kill_timeout: 5000,

      max_memory_restart: "300M",

      // =========================
      // LOGS
      // =========================
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      error_file: "C:/proyectos/MQTT/logs/error.log",
      out_file: "C:/proyectos/MQTT/logs/out.log",

      merge_logs: true,

      // =========================
      // VARIABLES ENTORNO
      // =========================
      env: {
        // MQTT
        MQTT_URL: "mqtt://10.106.100.50:1883",
        MQTT_TOPIC: "horometros",

        // SQL SERVER
        DB_USER: "sa",
        DB_PASSWORD: "s3qU3l1t0",
        DB_SERVER: "10.106.100.15",
        DB_NAME: "SGM",

        // SQL FLAGS
        DB_ENCRYPT: "false",
        DB_TRUST_CERT: "true",

        // NODE
        NODE_ENV: "production"
      }
    }
  ]
}