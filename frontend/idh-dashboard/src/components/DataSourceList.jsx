// Arquivo: frontend/idh-dashboard/src/components/DataSourceList.jsx
// (VERSÃO FINAL - Substitua o seu arquivo por este)

import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import Modal from "react-modal";
// --- IMPORTAÇÕES DOS GRÁFICOS ---
import AnomalyChart from "./AnomalyChart.jsx";
import RulChart from "./RulChart.jsx"; // Importa o gráfico de RUL

Modal.setAppElement("#root");

function DataSourceList({ listKey }) {
    const [dataSources, setDataSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [analysisJobs, setAnalysisJobs] = useState({});
    const pollingIntervalsRef = useRef({});
    const [selectedJobDetails, setSelectedJobDetails] = useState(null);
    const isMountedRef = useRef(true);

    // Efeito 1: Carregar a lista de fontes
    useEffect(() => {
        isMountedRef.current = true;
        const fetchDataSources = async () => {
            if (isMountedRef.current) setLoading(true);
            if (isMountedRef.current) setError(null);
            try {
                const response = await axios.get(
                    "http://localhost:8080/api/datasources"
                );
                if (isMountedRef.current) setDataSources(response.data || []);
            } catch (err) {
                console.error("Erro ao buscar fontes de dados:", err);
                if (isMountedRef.current)
                    setError(
                        "Falha ao carregar dados. Verifique se o backend está rodando."
                    );
                if (isMountedRef.current) setDataSources([]);
            } finally {
                if (isMountedRef.current) setLoading(false);
            }
        };
        fetchDataSources();

        // Função de limpeza do Efeito 1
        return () => {
            isMountedRef.current = false; // Define como desmontado
        };
    }, [listKey]);

    // Efeito 2: Limpeza Mestra
    useEffect(() => {
        return () => {
            console.log("DataSourceList desmontado. Limpando todos os timers.");
            Object.values(pollingIntervalsRef.current).forEach(clearInterval);
            pollingIntervalsRef.current = {};
        };
    }, []);

    // Função para parar um timer de polling específico
    const stopPolling = (id) => {
        if (pollingIntervalsRef.current[id]) {
            clearInterval(pollingIntervalsRef.current[id]);
            delete pollingIntervalsRef.current[id];
        }
    };

    // Função para verificar o status de um job
    const checkJobStatus = async (dataSourceId) => {
        try {
            const response = await axios.get(
                `http://localhost:8080/api/datasources/analysis/latest/${dataSourceId}`
            );
            const result = response.data;
            if (isMountedRef.current) {
                setAnalysisJobs((prevJobs) => ({
                    ...prevJobs,
                    [dataSourceId]: result,
                }));
            }

            if (result.status === "COMPLETED" || result.status === "FAILED") {
                console.log(
                    `Job ${result.id} (Fonte ${dataSourceId}) terminou com status: ${result.status}`
                );
                stopPolling(dataSourceId);
            } else {
                console.log(
                    `Job ${result.id} (Fonte ${dataSourceId}) ainda está: ${result.status}. Verificando novamente em 3s...`
                );
            }
        } catch (err) {
            console.error(
                `Erro ao verificar status do job para Fonte ${dataSourceId}:`,
                err
            );
            stopPolling(dataSourceId);
            if (isMountedRef.current) {
                setAnalysisJobs((prevJobs) => ({
                    ...prevJobs,
                    [dataSourceId]: {
                        status: "ERROR",
                        errorMessage: "Falha ao buscar status.",
                    },
                }));
            }
        }
    };

    // Função principal para iniciar a análise (chamada pelo botão)
    const handleAnalyze = async (id) => {
        console.log(`Solicitando análise para ID: ${id}`);
        setAnalysisJobs((prevJobs) => ({
            ...prevJobs,
            [id]: { status: "PENDING", resultSummary: "Enviando pedido..." },
        }));
        stopPolling(id);

        try {
            const response = await axios.post(
                `http://localhost:8080/api/datasources/${id}/analyze`
            );
            if (response.status === 202) {
                const job = response.data;
                console.log("Pedido de análise aceito, Job ID:", job.id);
                if (isMountedRef.current)
                    setAnalysisJobs((prevJobs) => ({ ...prevJobs, [id]: job }));
                checkJobStatus(id);
                const intervalId = setInterval(() => checkJobStatus(id), 3000);
                pollingIntervalsRef.current[id] = intervalId;
            } else {
                throw new Error(
                    `Status ${response.status}: ${response.statusText}`
                );
            }
        } catch (err) {
            console.error("Erro ao disparar análise:", err);
            const errMsg =
                err.response?.data?.message ||
                err.response?.data ||
                err.message ||
                "Falha desconhecida";
            if (isMountedRef.current) {
                setAnalysisJobs((prevJobs) => ({
                    ...prevJobs,
                    [id]: {
                        status: "FAILED",
                        errorMessage: `Falha ao iniciar Job: ${errMsg}`,
                    },
                }));
            }
        }
    };

    // Função que prepara os dados e abre o Modal (COM LÓGICA DE PARSE DUPLO)
    const openModalWithData = (job) => {
        console.log("[DEBUG] Preparando dados do modal para Job:", job);

        try {
            let parsedDetails = null;

            if (typeof job.resultDetailsJson === "string") {
                console.log(
                    "[DEBUG] Tentativa 1: Analisando resultDetailsJson (que é string)..."
                );
                parsedDetails = JSON.parse(job.resultDetailsJson);
            } else if (
                typeof job.resultDetailsJson === "object" &&
                job.resultDetailsJson !== null
            ) {
                console.log("[DEBUG] resultDetailsJson já é um objeto.");
                parsedDetails = job.resultDetailsJson; // Já é um objeto
            } else {
                throw new Error(
                    "resultDetailsJson está nulo ou em formato inválido."
                );
            }

            // Verificação de "Parse-Duplo"
            if (typeof parsedDetails === "string") {
                console.log(
                    "[DEBUG] Tentativa 2: O resultado do primeiro parse ainda é uma STRING. Analisando novamente..."
                );
                parsedDetails = JSON.parse(parsedDetails);
            }

            console.log(
                "[DEBUG] Parse concluído. Dados finais:",
                parsedDetails
            );

            // Define os dados para o modal
            setSelectedJobDetails({ ...job, parsedDetails });
        } catch (e) {
            console.error("Erro ao analisar JSON de resultados:", e);
            // Define dados com erro para exibir a mensagem no modal
            setSelectedJobDetails({
                ...job,
                parsedDetails: null,
                parseError: e.message,
            });
        }
    };

    // Função para fechar o Modal
    const closeModal = () => {
        setSelectedJobDetails(null);
    };

    // --- Renderização ---
    if (loading) return <p>Carregando fontes de dados...</p>;
    if (error) return <p style={{ color: "red" }}>{error}</p>;

    // Função auxiliar para renderizar o status
    const renderJobStatus = (source) => {
        const job = analysisJobs[source.id];
        if (!job) return null;

        switch (job.status) {
            case "PENDING":
            case "RUNNING":
                return (
                    <small style={{ color: "blue" }}>
                        Status: {job.status}...
                    </small>
                );

            case "COMPLETED":
                const hasDetails =
                    job.resultDetailsJson && job.resultDetailsJson !== "null";

                // --- ALTERAÇÃO: Mude o texto do link se for QC ---
                const linkText =
                    job.analysisType === "QC_VISUAL_CLASSIFICATION"
                        ? "(Ver Veredito)"
                        : "(Ver Gráfico)";

                if (hasDetails) {
                    return (
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                openModalWithData(job);
                            }}
                            style={{
                                color: "green",
                                fontWeight: "bold",
                                cursor: "pointer",
                                textDecoration: "underline",
                            }}
                        >
                            Resultado: {job.resultSummary || "Concluído"}{" "}
                            {linkText}
                        </a>
                    );
                }

                return (
                    <small style={{ color: "green" }}>
                        <strong>
                            Resultado: {job.resultSummary || "Concluído"}
                        </strong>
                    </small>
                );

            case "FAILED":
                return (
                    <small style={{ color: "red" }}>
                        Falha: {job.errorMessage || "Erro desconhecido"}
                    </small>
                );
            case "ERROR":
                return (
                    <small style={{ color: "red" }}>{job.errorMessage}</small>
                );
            default:
                return null;
        }
    };

    // --- FUNÇÃO AUXILIAR PARA RENDERIZAR O CONTEÚDO DO MODAL ---
    const renderModalContent = () => {
        if (!selectedJobDetails) return null;

        const { parsedDetails, parseError, analysisType } = selectedJobDetails;

        // CASO 1: Erro no Parse (mostra antes de tudo)
        if (parseError) {
            return (
                <p style={{ color: "red" }}>
                    Erro ao analisar dados: {parseError}
                </p>
            );
        }

        // CASO 2: O parse funcionou, mas não há detalhes
        if (!parsedDetails) {
            return <p>Análise concluída sem dados detalhados.</p>;
        }

        // --- ROTEADOR DE VISUALIZAÇÃO ---
        switch (analysisType) {
            case "ANOMALY_DETECTION":
                return <AnomalyChart analysisData={parsedDetails} />;

            case "RUL_PREDICTION":
                // Certifique-se que o RulChart.jsx existe na pasta components
                return <RulChart analysisData={parsedDetails} />;

            case "QC_VISUAL_CLASSIFICATION":
                const color =
                    parsedDetails.verdict === "APROVADO" ? "green" : "red";
                return (
                    <div
                        style={{
                            padding: "20px",
                            background: "#f4f4f4",
                            textAlign: "center",
                            borderRadius: "8px",
                            marginTop: "15px",
                        }}
                    >
                        <h4 style={{ margin: 0, color: "#333" }}>
                            Veredito da Classificação:
                        </h4>
                        <p
                            style={{
                                fontSize: "2.5em",
                                fontWeight: "bold",
                                margin: "10px 0 0 0",
                                color: color,
                            }}
                        >
                            {parsedDetails.verdict}
                        </p>
                        <small style={{ color: "#555" }}>
                            Confiança:{" "}
                            {parsedDetails.confidence_percent?.toFixed(2) ??
                                "N/A"}
                            %
                        </small>
                    </div>
                );

            default:
                // CASO 5: Fallback para tipos desconhecidos
                return (
                    <p>
                        Tipo de análise ({analysisType}) não possui visualização
                        detalhada.
                    </p>
                );
        }
    };

    return (
        <div>
            <h2>Fontes de Dados Registradas</h2>

            {dataSources.length === 0 ? (
                <p>Nenhuma fonte de dados encontrada.</p>
            ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                    {dataSources.map((source) => {
                        const isLoading =
                            analysisJobs[source.id]?.status === "PENDING" ||
                            analysisJobs[source.id]?.status === "RUNNING";

                        return (
                            <li
                                key={source.id}
                                style={{
                                    border: "1px solid #eee",
                                    padding: "10px",
                                    marginBottom: "10px",
                                    borderRadius: "8px",
                                }}
                            >
                                <div>
                                    <strong>{source.name}</strong> (
                                    {source.sourceType}) - ID: {source.id}
                                </div>
                                <small>Local: {source.location || "N/A"}</small>
                                <br />
                                <small>
                                    Descrição: {source.description || "N/A"}
                                </small>
                                <br />
                                <small>
                                    Criado em:{" "}
                                    {new Date(
                                        source.createdAt
                                    ).toLocaleString()}
                                </small>
                                <br />

                                {source.location && (
                                    <button
                                        onClick={() => handleAnalyze(source.id)}
                                        disabled={isLoading}
                                        style={{ marginTop: "10px" }}
                                    >
                                        {isLoading
                                            ? "Analisando..."
                                            : "Analisar"}
                                    </button>
                                )}

                                <div style={{ marginTop: "5px" }}>
                                    {renderJobStatus(source)}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* --- MODAL ATUALIZADO (VERSÃO FINAL COM ROTEADOR) --- */}
            <Modal
                isOpen={selectedJobDetails !== null}
                onRequestClose={closeModal}
                contentLabel="Detalhes da Análise"
                style={{
                    content: {
                        top: "50%",
                        left: "50%",
                        right: "auto",
                        bottom: "auto",
                        marginRight: "-50%",
                        transform: "translate(-50%, -50%)",
                        width: "80%",
                        maxWidth: "900px",
                        padding: "25px",
                        maxHeight: "85vh",
                        overflowY: "auto",
                        borderRadius: "8px",
                        color: "#333", // <-- CORREÇÃO PARA TEXTO BRANCO
                    },
                    overlay: {
                        backgroundColor: "rgba(0, 0, 0, 0.75)",
                        zIndex: 1000,
                    },
                }}
            >
                {selectedJobDetails && (
                    <div>
                        <button
                            onClick={closeModal}
                            style={{
                                position: "absolute",
                                top: "10px",
                                right: "10px",
                                cursor: "pointer",
                                background: "none",
                                border: "none",
                                fontSize: "1.5em",
                                color: "#888",
                            }}
                            aria-label="Fechar modal"
                        >
                            &times;
                        </button>
                        <h3>
                            Detalhes da Análise (Job ID: {selectedJobDetails.id}
                            )
                        </h3>
                        <p>
                            <strong>Resultado:</strong>{" "}
                            {selectedJobDetails.resultSummary}
                        </p>

                        {/* --- LÓGICA DE RENDERIZAÇÃO DINÂMICA --- */}
                        {renderModalContent()}
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default DataSourceList;
