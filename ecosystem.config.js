module.exports = {
  apps: [{
    name: 'api-playground',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3004',
    cwd: '/home/adityahimaone/apps/api-playground',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3004
    }
  }]
};
