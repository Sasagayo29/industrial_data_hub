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
# Importe o tipo JSON
from sqlalchemy import create_engine, Column, String, Text, BigInteger, DateTime, func, JSON 
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError

# --- Configurações (Lidas do Ambiente do Docker) ---
RABBITMQ_HOST = os.getenv('RABBITMQ_HOST', 'localhost')
QUEUE_NAME = 'analysis_queue'

DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD_RAW = os.getenv('DB_PASSWORD', 'Rique290721@.') # Senha padrão se a variável não for definida
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '3306')
DB_NAME = os.getenv('DB_NAME', 'industrial_data_hub')

# Codifica a senha para ser segura em uma URL
DB_PASSWORD_ENCODED = urllib.parse.quote_plus(DB_PASSWORD_RAW)

# String de conexão do SQLAlchemy
DB_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD_ENCODED}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
# --- Caminhos ---
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
MODELS_DIR = PROJECT_ROOT / "models"
BACKEND_DIR = PROJECT_ROOT / "backend"

# --- Configuração do Banco de Dados (SQLAlchemy) ---
try:
    engine = create_engine(DB_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()
except Exception as db_init_err:
    print(f"[worker] ERRO CRÍTICO ao inicializar SQLAlchemy: {db_init_err}")
    sys.exit(1)

# --- Definição da Tabela (com a coluna JSON) ---
class AnalysisResult(Base):
    __tablename__ = 'analysis_results'
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    dataSourceId = Column("data_source_id", BigInteger, nullable=False)
    analysisType = Column("analysis_type", String(100), nullable=False)
    status = Column(String(50), nullable=False)
    resultSummary = Column("result_summary", Text)
    errorMessage = Column("error_message", Text)
    
    # --- GARANTA QUE ESTA LINHA ESTÁ PRESENTE ---
    result_details_json = Column("result_details_json", JSON, nullable=True) 

    createdAt = Column("created_at", DateTime, server_default=func.now())
    updatedAt = Column("updated_at", DateTime, server_default=func.now(), onupdate=func.now())

# =============================================================================
# ARTEFATOS E LÓGICA DE ANÁLISE (O Roteador)
# =============================================================================

@functools.lru_cache(maxsize=None)
def load_anomaly_artifacts():
    print("[worker] Carregando artefatos de DETECÇÃO DE ANOMALIA...")
    model = tf.keras.models.load_model(MODELS_DIR / "autoencoder_model.h5", compile=False)
    scaler = joblib.load(MODELS_DIR / "anomaly_scaler.pkl")
    threshold = 0.050353 # <<< CONFIRME SE ESTE É O SEU VALOR
    return model, scaler, threshold

@functools.lru_cache(maxsize=None)
def load_rul_artifacts():
    print("[worker] Carregando artefatos de PREVISÃO DE RUL...")
    model = tf.keras.models.load_model(MODELS_DIR / "rul_model.h5", compile=False)
    scaler = joblib.load(MODELS_DIR / "rul_scaler.pkl")
    return model, scaler

def create_sequences(data, time_steps):
    X = []
    for i in range(len(data) - time_steps + 1):
        v = data[i:(i + time_steps)]
        X.append(v)
    return np.array(X)

def run_anomaly_analysis(file_path):
    model, scaler, threshold = load_anomaly_artifacts()
    TIME_STEPS = 20
    SENSOR_COLS = [
        'Accelerometer1RMS', 'Accelerometer2RMS', 'Current', 'Pressure', 
        'Temperature', 'Thermocouple', 'Voltage', 'Volume Flow RateRMS'
    ]
    
    print(f"[worker] Lendo arquivo SKAB: {file_path}")
    df = pd.read_csv(file_path, sep=';', parse_dates=['datetime'], index_col='datetime')
    
    if not all(col in df.columns for col in SENSOR_COLS):
        raise ValueError(f"CSV SKAB não contém todas as colunas esperadas.")
    
    df_sensors = df[SENSOR_COLS]
    df_scaled = scaler.transform(df_sensors)
    sequences = create_sequences(df_scaled, TIME_STEPS)
    
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
    
    return summary, details

def run_rul_analysis(file_path):
    model, scaler = load_rul_artifacts()
    TIME_STEPS = 50
    SENSOR_COLS = [
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

    last_engine_data = df[df['engine_id'] == df['engine_id'].max()]
    df_sensors = last_engine_data[SENSOR_COLS]
    df_scaled = scaler.transform(df_sensors)
    last_sequence_raw = df_scaled[-TIME_STEPS:]
    
    padded_sequence = np.zeros((TIME_STEPS, len(SENSOR_COLS)))
    padded_sequence[-last_sequence_raw.shape[0]:] = last_sequence_raw
    model_input = np.reshape(padded_sequence, (1, TIME_STEPS, len(SENSOR_COLS)))

    print(f"[worker] Executando previsão de RUL (model.predict)...")
    rul_prediction = model.predict(model_input)
    rul_value = float(rul_prediction[0][0])

    summary = f"Previsão de RUL: {rul_value:.2f} ciclos restantes."
    details = { 'predicted_rul': rul_value }
    
    return summary, details

# =============================================================================
# CALLBACK E MAIN (O Roteador)
# =============================================================================

def callback(ch, method, properties, body):
    print(f"\n[worker] Mensagem recebida! (Delivery Tag: {method.delivery_tag})")
    session = SessionLocal()
    job = None
    
    try:
        message_data = json.loads(body.decode('utf-8'))
        print(f"  Conteúdo: {message_data}")

        job_id = message_data.get('analysisResultId')
        if not job_id:
            raise ValueError("Mensagem JSON inválida (faltando 'analysisResultId').")

        job = session.get(AnalysisResult, job_id)
        if not job:
            raise ValueError(f"Job ID {job_id} não encontrado no banco de dados.")
        
        if job.status != 'PENDING':
            print(f"[worker] Job ID {job_id} já está em status '{job.status}'. Ignorando.")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        job.status = 'RUNNING'
        job.updatedAt = func.now()
        session.commit()
        print(f"[worker] Job {job_id} atualizado para RUNNING.")

        try:
            file_path_relative = message_data.get('filePath')
            analysis_type = message_data.get('analysisType')
            if not file_path_relative:
                raise ValueError("Mensagem JSON inválida (faltando 'filePath').")
            file_path_absolute = (BACKEND_DIR / file_path_relative).resolve()
            if not file_path_absolute.exists():
                raise FileNotFoundError(f"Arquivo CSV não encontrado em {file_path_absolute}")

            result_summary = None
            result_details = None # Deve ser 'None' por padrão

            if analysis_type == 'ANOMALY_DETECTION':
                result_summary, result_details = run_anomaly_analysis(file_path_absolute)
            elif analysis_type == 'RUL_PREDICTION':
                result_summary, result_details = run_rul_analysis(file_path_absolute)
            else:
                raise ValueError(f"Tipo de análise desconhecido: '{analysis_type}'")

            print(f"[worker] Job {job_id} concluído. Resultado: {result_summary}")
            
            # --- GARANTA QUE ESTA SEÇÃO ESTÁ CORRETA ---
            job.status = 'COMPLETED'
            job.resultSummary = result_summary
            job.result_details_json = result_details # <-- Salva o dicionário (SQLAlchemy converte)
            job.updatedAt = func.now()
            # --- FIM DA SEÇÃO ---

        except Exception as analysis_error:
            print(f"[worker] ERRO na análise do Job {job_id}: {analysis_error}")
            session.rollback() 
            job = session.get(AnalysisResult, job_id) 
            job.status = 'FAILED'
            job.errorMessage = str(analysis_error)
            job.updatedAt = func.now()
        
        session.commit()
        print(f"[worker] Job {job_id} salvo no banco com status '{job.status}'.")
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
        print("[worker] Mensagem processada e confirmada (ACK). Aguardando...")

    except (json.JSONDecodeError, ValueError) as data_err:
        print(f"[worker] ERRO DE DADOS: {data_err}")
        if job:
            job.status = 'FAILED'; job.errorMessage = str(data_err); session.commit()
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as e:
        print(f"[worker] ERRO INESPERADO no worker: {e}")
        if session: session.rollback()
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True) 
    finally:
        if session:
            session.close()

def main():
    print("[worker] Iniciando worker de análise...")
    print(f"[worker] Pasta raiz do projeto: {PROJECT_ROOT}")
    print(f"[worker] Conectando ao MySQL em: {DB_HOST}...")
    
    try:
        engine.connect().close()
        print("[worker] Conexão com MySQL validada.")
    except SQLAlchemyError as db_err:
        print(f"[worker] ERRO CRÍTICO ao conectar ao MySQL: {db_err}")
        sys.exit(1)
        
    try:
        load_anomaly_artifacts()
        load_rul_artifacts()
    except Exception as artifact_err:
        print(f"[worker] AVISO: Falha ao pré-carregar artefatos (continuando): {artifact_err}")

    connection = None
    try:
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
        channel = connection.channel()
        channel.queue_declare(queue=QUEUE_NAME, durable=True)
        channel.basic_qos(prefetch_count=1)
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