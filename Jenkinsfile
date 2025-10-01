pipeline {
    agent any

    environment {
        PM2_ECOSYSTEM = "ecosystem.config.cjs"
    }

    stages {
        stage('Pull Latest Code') {
            steps {
                echo "Pulling latest code from GitHub..."
                sh 'git pull origin main'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo "Installing npm dependencies..."
                sh 'npm install'
            }
        }

        stage('Restart Backend') {
            steps {
                echo "Restarting backend with PM2..."
                sh "pm2 restart ${PM2_ECOSYSTEM} || pm2 start ${PM2_ECOSYSTEM}"
                sh "pm2 save"
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
