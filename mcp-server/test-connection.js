
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testConnection() {
  console.log("🔍 Iniciando teste de conexão com Firestore...");

  const keyPath = path.join(__dirname, "serviceAccountKey.json");

  if (!fs.existsSync(keyPath)) {
    console.error("❌ ERRO: Arquivo 'serviceAccountKey.json' não encontrado na pasta mcp-server.");
    console.log("👉 Por favor, baixe a chave privada do Firebase Console e salve-a nesta pasta com esse nome exato.");
    console.log("   URL: https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk");
    process.exit(1);
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    console.log(`✅ Arquivo de chave encontrado. Projeto ID: ${serviceAccount.project_id}`);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    const db = getFirestore();
    console.log("📡 Tentando ler coleções do Firestore...");
    
    const collections = await db.listCollections();
    const collectionIds = collections.map(col => col.id);
    
    if (collectionIds.length === 0) {
        console.log("⚠️ Conexão efetuada, mas nenhuma coleção foi encontrada (banco vazio ou permissões limitadas).");
    } else {
        console.log("✅ SUCEESO! Conectado ao Firestore.");
        console.log("📂 Coleções encontradas:", collectionIds.join(", "));
    }

    console.log("\n🎉 Tudo pronto! Agora você pode configurar seu cliente MCP.");

  } catch (error) {
    console.error("❌ FALHA na conexão:", error.message);
    if (error.code === 'ENOENT') {
        console.error("   O arquivo parece ilegível ou inválido.");
    } else {
        console.error("   Verifique se a chave é válida e se a Service Account tem permissões.");
    }
  }
}

testConnection();
