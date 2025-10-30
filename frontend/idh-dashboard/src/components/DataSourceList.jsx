// Arquivo: frontend/idh-dashboard/src/components/DataSourceList.jsx
// (VERSÃO COMPLETA E CORRIGIDA para exibir o gráfico no Modal)

import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import Modal from "react-modal";
import AnomalyChart from "./AnomalyChart.jsx"; // <-- IMPORTADO

Modal.setAppElement("#root");

function DataSourceList({ listKey }) {
    const [dataSources, setDataSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [analysisJobs, setAnalysisJobs] = useState({});
    const pollingIntervalsRef = useRef({});
    const [selectedJobDetails, setSelectedJobDetails] = useState(null);
    const isMountedRef = useRef(true); // Trava de segurança contra "race condition"

    // Efeito 1: Carregar a lista de fontes
    useEffect(() => {
        isMountedRef.current = true; // Define como montado
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
        // A função retornada é executada quando o componente é desmontado
        return () => {
            console.log("DataSourceList desmontado. Limpando todos os timers.");
            Object.values(pollingIntervalsRef.current).forEach(clearInterval);
            pollingIntervalsRef.current = {};
        };
    }, []); // Array vazio [] = rodar apenas no mount/unmount

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

    // Função que prepara os dados e abre o Modal
    const openModalWithData = (job) => {
        console.log("[DEBUG] Preparando dados do modal para Job:", job);
        console.log(
            "[DEBUG] Tipo do job.resultDetailsJson:",
            typeof job.resultDetailsJson
        );
        console.log(
            "[DEBUG] Conteúdo do job.resultDetailsJson:",
            job.resultDetailsJson
        );

        try {
            let parsedDetails = null;

            // --- CORREÇÃO: PARSE DUPLO ---
            console.log("[DEBUG] Tentativa 1: Analisando resultDetailsJson...");
            if (typeof job.resultDetailsJson === "string") {
                parsedDetails = JSON.parse(job.resultDetailsJson);
            } else if (
                typeof job.resultDetailsJson === "object" &&
                job.resultDetailsJson !== null
            ) {
                parsedDetails = job.resultDetailsJson; // Já é um objeto
            } else {
                throw new Error(
                    "resultDetailsJson está nulo ou em formato inválido."
                );
            }

            // SEGUNDA VERIFICAÇÃO: O resultado do primeiro parse ainda é uma string?
            if (typeof parsedDetails === "string") {
                console.log(
                    "[DEBUG] Tentativa 2: O resultado do primeiro parse ainda é uma STRING. Analisando novamente..."
                );
                parsedDetails = JSON.parse(parsedDetails); // Faz o parse da string interna
            }
            // --- FIM DA CORREÇÃO ---

            console.log(
                "[DEBUG] Parse concluído. Dados finais:",
                parsedDetails
            );

            // Define os dados para o modal (isso o abrirá na próxima renderização)
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

        // [LINHA DO BUG REMOVIDA] A linha "setSelectedJobDetails(job);"
        // que estava aqui foi removida, pois ela sobrescrevia o estado
        // com 'parsedDetails' e causava o bug.
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

                // Vamos apenas mostrar o link se tiver detalhes
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
                            Resultado: {job.resultSummary || "Concluído"} (Ver
                            Detalhes)
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

            {/* --- MODAL ATUALIZADO PARA MOSTRAR O GRÁFICO --- */}
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
                    },
                    overlay: {
                        backgroundColor: "rgba(0, 0, 0, 0.75)",
                        zIndex: 1000,
                    },
                }}
            >
                {/* VERIFICA SE O JOB FOI SELECIONADO */}
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
                                fontSize: "1.2em",
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

                        {/* --- CONTEÚDO DINÂMICO --- */}
                        {selectedJobDetails.parseError ? (
                            // 1. Se deu erro no parse
                            <p style={{ color: "red" }}>
                                Erro ao analisar dados do gráfico:{" "}
                                {selectedJobDetails.parseError}
                            </p>
                        ) : selectedJobDetails.parsedDetails ? (
                            // 2. Se o parse funcionou, renderiza o gráfico
                            <AnomalyChart
                                analysisData={selectedJobDetails.parsedDetails}
                            />
                        ) : (
                            // 3. Se não tem dados de detalhe (mas não deu erro)
                            <p>
                                Análise concluída sem dados detalhados para
                                exibição.
                            </p>
                        )}
                        {/* --- FIM DO CONTEÚDO DINÂMICO --- */}
                    </div>
                )}
            </Modal>
        </div>
    );
}

export default DataSourceList;
