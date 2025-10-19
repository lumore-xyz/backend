pipeline {
    agent any

    environment {
        APP_DIR = "/opt/backend"
        PM2_ECOSYSTEM = "ecosystem.config.cjs"
    }

    stages {
        stage('Pull Latest Code') {
            steps {
                echo "Cleaning workspace and pulling latest code from GitHub..."
                dir("${APP_DIR}") {
                    // Remove any local changes or untracked files
                    sh 'git reset --hard'
                    sh 'git clean -fd'
                    sh 'git pull origin main'
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                echo "Installing npm dependencies..."
                dir("${APP_DIR}") {
                    sh 'npm install'
                }
            }
        }

        stage('Restart Backend') {
            steps {
                echo "Restarting backend with PM2..."
                dir("${APP_DIR}") {
                    sh "pm2 restart ${PM2_ECOSYSTEM} || pm2 start ${PM2_ECOSYSTEM}"
                    sh "pm2 save"
                }
            }
        }
    }

    post {
        success {
            echo "Deployment Successful ✅"
        }
        failure {
            echo "Deployment Failed ❌"
        }
    }
}