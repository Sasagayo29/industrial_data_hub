# Arquivo: processing_worker/worker.py
# (VERSÃO MELHORADA E CORRIGIDA)

import pika
import json
import time
import sys
import os
from pathlib import Path
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib
import functools
import urllib.parse

# --- Novas importações ---
from PIL import Image # Para carregar imagens (Projeto 3)
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input as mobilenet_preprocess_input # Para processar imagens (Projeto 3)
# --- Fim das novas importações ---

# Importações do SQLAlchemy
from sqlalchemy import create_engine, Column, String, Text, BigInteger, DateTime, func, JSON 
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError

# --- Configurações (DB e RabbitMQ) ---
RABBITMQ_HOST = 'localhost'
QUEUE_NAME = 'analysis_queue'

# --- SUAS CREDENCIAIS DO MYSQL ---
DB_USER = 'root'
DB_PASSWORD_RAW = 'Rique290721@.' # Sua senha (com caracteres especiais)
DB_HOST = 'localhost'
DB_PORT = '3306'
DB_NAME = 'industrial_data_hub'

# Codifica a senha para ser segura na URL de conexão
DB_PASSWORD_ENCODED = urllib.parse.quote_plus(DB_PASSWORD_RAW)
DB_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD_ENCODED}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# --- Caminhos ---
# O worker.py está em (raiz)/processing_worker/
SCRIPT_DIR = Path(__file__).resolve().parent
# O PROJECT_ROOT é a pasta (raiz), ex: 'industrial_data_hub/'
PROJECT_ROOT = SCRIPT_DIR.parent
# A pasta models/ está na (raiz)
MODELS_DIR = PROJECT_ROOT / "models"
# A pasta backend/ está na (raiz)
BACKEND_DIR = PROJECT_ROOT / "backend"

# --- Configuração do Banco de Dados (SQLAlchemy) ---
try:
    engine = create_engine(DB_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()
except Exception as db_init_err:
    print(f"[worker] ERRO CRÍTICO ao inicializar SQLAlchemy: {db_init_err}")
    sys.exit(1)

# --- Definição da Tabela (Espelho da Entidade Java) ---
class AnalysisResult(Base):
    __tablename__ = 'analysis_results'
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    dataSourceId = Column("data_source_id", BigInteger, nullable=False)
    analysisType = Column("analysis_type", String(100), nullable=False)
    status = Column(String(50), nullable=False)
    resultSummary = Column("result_summary", Text)
    errorMessage = Column("error_message", Text)
    # Define a coluna para salvar o JSON
    result_details_json = Column("result_details_json", JSON, nullable=True) 
    createdAt = Column("created_at", DateTime, server_default=func.now())
    updatedAt = Column("updated_at", DateTime, server_default=func.now(), onupdate=func.now())

# =============================================================================
# ARTEFATOS E LÓGICA DE ANÁLISE
# =============================================================================

# --- Lógica de Carregamento (em cache) ---

@functools.lru_cache(maxsize=None)
def load_anomaly_artifacts():
    """Carrega modelo e scaler para Detecção de Anomalia (Projeto 2)"""
    print("[worker] Carregando artefatos de DETECÇÃO DE ANOMALIA...")
    model = tf.keras.models.load_model(MODELS_DIR / "autoencoder_model.h5", compile=False)
    scaler = joblib.load(MODELS_DIR / "anomaly_scaler.pkl")
    threshold = 0.050353 # <<< SEU VALOR (0.050353)
    print("[worker] Artefatos de Anomalia carregados.")
    return model, scaler, threshold

@functools.lru_cache(maxsize=None)
def load_rul_artifacts():
    """Carrega modelo e scaler para Previsão de RUL (Projeto 1)"""
    print("[worker] Carregando artefatos de PREVISÃO DE RUL...")
    model = tf.keras.models.load_model(MODELS_DIR / "rul_model.h5", compile=False)
    scaler = joblib.load(MODELS_DIR / "rul_scaler.pkl")
    print("[worker] Artefatos de RUL carregados.")
    return model, scaler

@functools.lru_cache(maxsize=None)
def load_qc_artifacts():
    """Carrega modelo para Controle de Qualidade Visual (Projeto 3)"""
    print("[worker] Carregando artefatos de CONTROLE DE QUALIDADE (CNN)...")
    model_path = MODELS_DIR / "qc_model.h5"
    if not model_path.exists():
         raise FileNotFoundError(f"Modelo de QC 'qc_model.h5' não encontrado na pasta /models")
    model = tf.keras.models.load_model(model_path, compile=False)
    print("[worker] Artefato de QC carregado.")
    return model

# --- Funções de Processamento Específicas ---

def create_sequences(data, time_steps):
    """Função auxiliar para criar janelas deslizantes (sequências)."""
    X = []
    for i in range(len(data) - time_steps + 1):
        v = data[i:(i + time_steps)]
        X.append(v)
    return np.array(X)

def run_anomaly_analysis(file_path):
    """Executa a lógica de Detecção de Anomalias (Projeto 2)."""
    model, scaler, threshold = load_anomaly_artifacts()
    TIME_STEPS = 20 # Específico do Proj 2
    SENSOR_COLS = [
        'Accelerometer1RMS', 'Accelerometer2RMS', 'Current', 'Pressure', 
        'Temperature', 'Thermocouple', 'Voltage', 'Volume Flow RateRMS'
    ]
    
    print(f"[worker] Lendo arquivo SKAB: {file_path}")
    df = pd.read_csv(file_path, sep=';', parse_dates=['datetime'], index_col='datetime')
    
    if not all(col in df.columns for col in SENSOR_COLS):
        raise ValueError(f"CSV SKAB não contém todas as colunas esperadas. Esperado: {SENSOR_COLS}")
    
    df_sensors = df[SENSOR_COLS]
    df_scaled = scaler.transform(df_sensors)
    sequences = create_sequences(df_scaled, TIME_STEPS)
    
    # --- MELHORIA DE ROBUSTEZ ---
    if len(sequences) == 0:
        raise ValueError(f"Não foi possível criar sequências. O arquivo precisa de pelo menos {TIME_STEPS} linhas de dados.")
    # --- FIM DA MELHORIA ---
    
    print(f"[worker] Executando detecção de anomalias (model.predict)...")
    sequences_pred = model.predict(sequences)
    reconstruction_errors = np.mean(np.abs(sequences_pred - sequences), axis=(1, 2))
    anomalies_detected = reconstruction_errors > threshold
    num_anomalies = np.sum(anomalies_detected)
    
    summary = f"{num_anomalies} anomalias detectadas em {len(sequences)} janelas."
    
    details = {
        'timestamps': df.index[TIME_STEPS - 1:].astype(str).tolist(),
        'reconstruction_errors': reconstruction_errors.tolist(),
        'threshold': threshold,
        'is_anomaly': anomalies_detected.astype(int).tolist()
    }
    
    return summary, details # Retorna sumário (string) e detalhes (dict)

# --- CORREÇÃO CRÍTICA (BUG DO GRÁFICO RUL) ---
def run_rul_analysis(file_path):
    """Executa a lógica de Previsão de RUL (Projeto 1) - VERSÃO CORRIGIDA."""
    model, scaler = load_rul_artifacts()
    TIME_STEPS = 50 # Específico do Proj 1
    SENSOR_COLS = [ # 19 features
        'setting_1', 'setting_2', 'sensor_2', 'sensor_3', 'sensor_4', 
        'sensor_5', 'sensor_6', 'sensor_7', 'sensor_8', 'sensor_9', 
        'sensor_11', 'sensor_12', 'sensor_13', 'sensor_14', 'sensor_15', 
        'sensor_16', 'sensor_17', 'sensor_20', 'sensor_21'
    ]
    
    print(f"[worker] Lendo arquivo Turbofan: {file_path}")
    col_names = ['engine_id', 'cycle', 'setting_1', 'setting_2', 'setting_3'] + [f'sensor_{i}' for i in range(1, 22)]
    df = pd.read_csv(file_path, sep=' ', header=None, names=col_names, index_col=False)
    df = df.dropna(axis=1, how='all')

    if not all(col in df.columns for col in SENSOR_COLS):
        raise ValueError(f"CSV Turbofan não contém todas as 19 colunas esperadas.")

    # Pega os dados do último motor no arquivo
    last_engine_data = df[df['engine_id'] == df['engine_id'].max()]
    
    df_sensors = last_engine_data[SENSOR_COLS]
    df_scaled = scaler.transform(df_sensors)
    
    # Cria sequências a partir de todo o histórico do motor
    sequences = create_sequences(df_scaled, TIME_STEPS)

    # --- MELHORIA DE ROBUSTEZ ---
    if len(sequences) == 0:
        raise ValueError(f"Não foi possível criar sequências. O motor (ID: {last_engine_data['engine_id'].max()}) precisa de pelo menos {TIME_STEPS} ciclos.")
    # --- FIM DA MELHORIA ---

    print(f"[worker] Executando previsão de RUL (model.predict) em {len(sequences)} sequências...")
    rul_predictions = model.predict(sequences)
    
    # Extrai os resultados para o JSON
    rul_values_list = rul_predictions.flatten().tolist()
    cycle_list = last_engine_data['cycle'].values[TIME_STEPS - 1:].tolist()
    
    # O "Resumo" (summary) será o RUL final (a última previsão)
    final_rul_value = rul_values_list[-1]
    summary = f"Previsão de RUL final: {final_rul_value:.2f} ciclos restantes."
    
    # Os "Detalhes" (details) serão a série temporal completa para o gráfico
    details = { 
        'cycles': cycle_list,
        'rul_predictions': rul_values_list
    }
    
    return summary, details
# --- FIM DA CORREÇÃO CRÍTICA ---

def run_qc_analysis(file_path):
    """Executa a lógica de Classificação Visual (Projeto 3)."""
    model = load_qc_artifacts()
    IMG_SIZE = (224, 224) # O tamanho que o MobileNetV2 espera

    print(f"[worker] Lendo arquivo de imagem: {file_path}")
    
    # 1. Carregar a Imagem
    img = Image.open(file_path)
    
    # 2. Pré-processar a Imagem
    if img.mode != "RGB":
        img = img.convert("RGB")
    img_resized = img.resize(IMG_SIZE)
    img_array = np.array(img_resized)
    img_batch = np.expand_dims(img_array, axis=0)
    
    # Usa a função de pré-processamento do MobileNetV2
    img_preprocessed = mobilenet_preprocess_input(img_batch)
    
    # 3. Executar Previsão
    print("[worker] Executando classificação visual (model.predict)...")
    prediction_prob = model.predict(img_preprocessed)[0][0] 
    
    # 4. Interpretar Resultados (0 = def_front, 1 = ok_front)
    # Ajuste esta lógica se suas classes forem diferentes
    if prediction_prob > 0.5:
        verdict = "APROVADO"
        confidence = prediction_prob * 100
    else:
        verdict = "DEFEITUOSO"
        confidence = (1 - prediction_prob) * 100

    summary = f"Veredito: {verdict} ({confidence:.2f}%)"
    details = {
        'verdict': verdict,
        'confidence_percent': float(confidence), # Converte para float nativo
        'prediction_raw': float(prediction_prob) # Converte para float nativo
    }
    
    return summary, details

# =============================================================================
# ROTEADOR DE ANÁLISE (DISPATCH TABLE)
# =============================================================================

# --- MELHORIA DE EXTENSIBILIDADE ---
# Mapeia o 'analysisType' (string) diretamente para a função que deve ser chamada.
# Para adicionar um "Projeto 4", basta adicionar uma nova linha aqui.
ANALYSIS_DISPATCHER = {
    'ANOMALY_DETECTION': run_anomaly_analysis,
    'RUL_PREDICTION': run_rul_analysis,
    'QC_VISUAL_CLASSIFICATION': run_qc_analysis,
}
# --- FIM DA MELHORIA ---


# =============================================================================
# CALLBACK E MAIN (O Roteador)
# =============================================================================

def callback(ch, method, properties, body):
    """Função chamada quando uma mensagem é recebida."""
    print(f"\n[worker] Mensagem recebida! (Delivery Tag: {method.delivery_tag})")
    session = SessionLocal() # Cria uma nova sessão de DB para esta tarefa
    job = None
    
    try:
        message_data = json.loads(body.decode('utf-8'))
        print(f"  Conteúdo: {message_data}")

        # --- 1. Buscar o Job no Banco ---
        job_id = message_data.get('analysisResultId')
        if not job_id:
            raise ValueError("Mensagem JSON inválida (faltando 'analysisResultId').")

        job = session.get(AnalysisResult, job_id)
        if not job:
            raise ValueError(f"Job ID {job_id} não encontrado no banco de dados.")
        
        # Evita processar o mesmo job duas vezes
        if job.status != 'PENDING':
            print(f"[worker] Job ID {job_id} já está em status '{job.status}'. Ignorando.")
            ch.basic_ack(delivery_tag=method.delivery_tag) # Confirma (remove) a msg da fila
            session.close() # Fecha a sessão
            return

        # --- 2. Atualizar Status para RUNNING ---
        job.status = 'RUNNING'
        job.updatedAt = func.now()
        session.commit()
        print(f"[worker] Job {job_id} atualizado para RUNNING.")

        # --- 3. Executar a Análise (Bloco Crítico) ---
        try:
            file_path_relative = message_data.get('filePath')
            analysis_type = message_data.get('analysisType')
            
            if not file_path_relative:
                raise ValueError("Mensagem JSON inválida (faltando 'filePath').")
            
            # Constrói o caminho absoluto: (raiz)/backend/uploads/arquivo.csv
            file_path_absolute = (BACKEND_DIR / file_path_relative).resolve()
            
            if not file_path_absolute.exists():
                raise FileNotFoundError(f"Arquivo não encontrado no caminho esperado: {file_path_absolute}")

            # --- O NOVO ROTEADOR (Usando o Dispatcher) ---
            if analysis_type not in ANALYSIS_DISPATCHER:
                raise ValueError(f"Tipo de análise desconhecido: '{analysis_type}'")

            # Chama a função correta (ex: run_anomaly_analysis)
            analysis_function = ANALYSIS_DISPATCHER[analysis_type]
            result_summary, result_details = analysis_function(file_path_absolute)
            # --- FIM DO NOVO ROTEADOR ---

            print(f"[worker] Job {job_id} concluído. Resultado: {result_summary}")
            
            # --- 4. Atualizar Job para COMPLETED ---
            job.status = 'COMPLETED'
            job.resultSummary = result_summary
            job.result_details_json = result_details # Salva o dicionário (SQLAlchemy converte)
            job.updatedAt = func.now()

        except Exception as analysis_error:
            # --- 4. (Falha) Atualizar Job para FAILED ---
            print(f"[worker] ERRO na análise do Job {job_id}: {analysis_error}")
            session.rollback() # Desfaz o status 'RUNNING' se necessário
            job = session.get(AnalysisResult, job_id) # Pega o objeto novamente
            job.status = 'FAILED'
            job.errorMessage = str(analysis_error)
            job.updatedAt = func.now()
        
        # --- 5. Salvar o Status Final (COMPLETED ou FAILED) ---
        session.commit()
        print(f"[worker] Job {job_id} salvo no banco com status '{job.status}'.")
        
        # --- 6. Confirmar Mensagem ao RabbitMQ ---
        ch.basic_ack(delivery_tag=method.delivery_tag)
        print("[worker] Mensagem processada e confirmada (ACK). Aguardando...")

    except (json.JSONDecodeError, ValueError) as data_err:
        # Erro fatal na mensagem (ex: JSON quebrado, Job ID não existe)
        print(f"[worker] ERRO DE DADOS: {data_err}")
        if job: # Tenta salvar o erro no job se ele foi encontrado
            job.status = 'FAILED'; job.errorMessage = str(data_err); session.commit()
        # Rejeita a mensagem (nack) e NÃO a re-enfileira (requeue=False)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as e:
        # Erro inesperado (ex: RabbitMQ caiu no meio, DB caiu)
        print(f"[worker] ERRO INESPERADO no worker: {e}")
        if session: session.rollback() # Desfaz qualquer mudança no DB
        # Rejeita e PEDE para re-enfileirar (requeue=True)
        # Outro worker (ou este, após reiniciar) pode tentar novamente
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True) 
    finally:
        if session:
            session.close() # Sempre fecha a sessão do DB

def main():
    print("[worker] Iniciando worker de análise...")
    print(f"[worker] Pasta raiz do projeto: {PROJECT_ROOT}")
    print(f"[worker] Conectando ao MySQL em: {DB_HOST}...")
    
    # Valida o DB
    try:
        engine.connect().close()
        print("[worker] Conexão com MySQL validada.")
    except SQLAlchemyError as db_err:
        print(f"[worker] ERRO CRÍTICO ao conectar ao MySQL: {db_err}")
        sys.exit(1)
        
    # Tenta carregar os artefatos na inicialização (aquecimento)
    try:
        load_anomaly_artifacts()
        load_rul_artifacts()
        load_qc_artifacts() # Carrega o novo modelo
    except Exception as artifact_err:
        print(f"[worker] AVISO: Falha ao pré-carregar um ou mais artefatos (continuando): {artifact_err}")

    connection = None
    try:
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
        channel = connection.channel()
        channel.queue_declare(queue=QUEUE_NAME, durable=True)
        channel.basic_qos(prefetch_count=1) # Pega apenas 1 msg por vez
        channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)

        print(f"\n[worker] Conectado ao RabbitMQ. Aguardando mensagens na fila '{QUEUE_NAME}'...")
        channel.start_consuming()

    except pika.exceptions.AMQPConnectionError as conn_err:
         print(f"[worker] ERRO CRÍTICO: Não foi possível conectar ao RabbitMQ em '{RABBITMQ_HOST}'.")
         sys.exit(1)
    except KeyboardInterrupt:
        print("\n[worker] Interrupção detectada. Encerrando...")
    finally:
        if connection is not None and connection.is_open:
            connection.close()
            print("[worker] Conexão com RabbitMQ fechada.")
        print("[worker] Worker encerrado.")

if __name__ == '__main__':
    main()