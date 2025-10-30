// Arquivo: frontend/idh-dashboard/src/components/DataSourceForm.jsx
// (VERSÃO ATUALIZADA com Seletor de Tipo de Análise)

import React, { useState } from "react";
import axios from "axios";

function DataSourceForm({ onDataSourceCreated }) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [file, setFile] = useState(null);

    // --- NOVO ESTADO ---
    // Define o tipo de análise. O valor DEVE corresponder ao que o worker Python espera.
    const [sourceType, setSourceType] = useState("ANOMALY_DETECTION"); // Valor padrão

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState("");

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);
        setSuccessMessage("");
        setIsSubmitting(true);

        try {
            // --- MUDANÇA AQUI ---
            // O sourceType agora é dinâmico, vindo do estado do formulário
            const dataSourcePayload = {
                name: name,
                description: description,
                sourceType: sourceType, // <-- Valor dinâmico do <select>
                location: null,
            };

            const createResponse = await axios.post(
                "http://localhost:8080/api/datasources",
                dataSourcePayload,
                { headers: { "Content-Type": "application/json" } }
            );

            if (createResponse.status === 201) {
                const createdSource = createResponse.data;

                if (file) {
                    const formData = new FormData();
                    formData.append("file", file);

                    try {
                        const uploadResponse = await axios.post(
                            `http://localhost:8080/api/datasources/${createdSource.id}/upload`,
                            formData,
                            {
                                headers: {
                                    "Content-Type": "multipart/form-data",
                                },
                            }
                        );

                        if (uploadResponse.status === 200) {
                            setSuccessMessage(
                                `Fonte '${name}' (Tipo: ${sourceType}) e arquivo '${file.name}' registrados!`
                            );
                            // Limpa o formulário
                            setName("");
                            setDescription("");
                            setFile(null);
                            setSourceType("ANOMALY_DETECTION"); // Reseta para o padrão
                            if (document.getElementById("file-input")) {
                                document.getElementById("file-input").value =
                                    "";
                            }
                            if (onDataSourceCreated) {
                                onDataSourceCreated();
                            }
                        } else {
                            throw new Error(
                                `Erro no upload: ${uploadResponse.status} ${uploadResponse.statusText}`
                            );
                        }
                    } catch (uploadError) {
                        console.error(
                            "Erro durante o upload do arquivo:",
                            uploadError
                        );
                        const errMsg =
                            uploadError.response?.data?.message ||
                            uploadError.message ||
                            "Falha no upload do arquivo.";
                        setError(`Erro ao fazer upload do arquivo: ${errMsg}.`);
                    }
                } else {
                    // Sucesso sem arquivo
                    setSuccessMessage(
                        `Fonte '${name}' (Tipo: ${sourceType}) registrada (sem arquivo)!`
                    );
                    setName("");
                    setDescription("");
                    setSourceType("ANOMALY_DETECTION");
                    if (onDataSourceCreated) {
                        onDataSourceCreated();
                    }
                }
            } else if (createResponse.status === 409) {
                setError(
                    `Erro: Já existe uma fonte de dados com o nome '${name}'.`
                );
            } else {
                throw new Error(
                    `Erro ao criar fonte: ${createResponse.status} ${createResponse.statusText}`
                );
            }
        } catch (submitError) {
            console.error("Erro ao submeter formulário:", submitError);
            const errMsg =
                submitError.response?.data?.message ||
                submitError.message ||
                "Falha ao registrar fonte de dados.";
            setError(`Erro: ${errMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            style={{
                marginTop: "20px",
                padding: "15px",
                border: "1px solid #ccc",
            }}
        >
            <h3>Registrar Nova Fonte de Dados</h3>
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "10px" }}>
                    <label htmlFor="nameInput">Nome da Fonte:</label>
                    <br />
                    <input
                        id="nameInput"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        style={{ width: "90%" }}
                    />
                </div>

                {/* --- NOVO CAMPO <select> --- */}
                <div style={{ marginBottom: "10px" }}>
                    <label htmlFor="typeInput">Tipo de Análise:</label>
                    <br />
                    <select
                        id="typeInput"
                        value={sourceType}
                        onChange={(e) => setSourceType(e.target.value)}
                        style={{ width: "90%" }}
                    >
                        <option value="ANOMALY_DETECTION">
                            Detecção de Anomalias (SKAB)
                        </option>
                        <option value="RUL_PREDICTION">
                            Previsão de RUL (Turbofan)
                        </option>
                        <option value="QC_VISUAL_CLASSIFICATION">
                            Controle de Qualidade (Imagens)
                        </option>
                        {/* Podemos adicionar mais tipos no futuro */}
                    </select>
                </div>
                {/* --- FIM DO NOVO CAMPO --- */}

                <div style={{ marginBottom: "10px" }}>
                    <label htmlFor="descInput">Descrição (Opcional):</label>
                    <br />
                    <textarea
                        id="descInput"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        style={{ width: "90%" }}
                    />
                </div>
                <div style={{ marginBottom: "10px" }}>
                    <label htmlFor="fileInput">Arquivo de Dados:</label>
                    <br />
                    <input
                        id="file-input"
                        type="file"
                        // Removido o accept=".csv" para aceitar imagens também
                        onChange={handleFileChange}
                    />
                    {file && <small> Selecionado: {file.name}</small>}
                </div>

                {error && <p style={{ color: "red" }}>{error}</p>}
                {successMessage && (
                    <p style={{ color: "green" }}>{successMessage}</p>
                )}

                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Registrando..." : "Registrar Fonte"}
                </button>
            </form>
        </div>
    );
}

export default DataSourceForm;
