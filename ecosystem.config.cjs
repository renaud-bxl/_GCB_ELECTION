module.exports = {
  apps: [
    {
      name: 'coomans-campaign',
      script: 'node',
      args: 'dist/index.js',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      error_file: '/home/user/webapp/logs/err.log',
      out_file: '/home/user/webapp/logs/out.log',
    }
  ]
}
