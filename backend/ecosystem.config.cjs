module.exports = {
  apps: [
    { name: "tcr-backend", cwd: "/var/www/teamclassicrollers/backend", script: "server.js", instances: 1, exec_mode: "fork", autorestart: true, max_memory_restart: "250M", env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: 3100 } },
    { name: "tcr-telegram-bot", cwd: "/var/www/teamclassicrollers/backend", script: "telegram-bot/bot.js", instances: 1, exec_mode: "fork", autorestart: true, max_memory_restart: "150M", env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: 3100 } }
  ]
};
