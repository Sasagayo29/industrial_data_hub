// Arquivo: frontend/idh-dashboard/src/components/AnomalyChart.jsx
// (VERSÃO CORRIGIDA E LIMPA)

import React from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

function AnomalyChart({ analysisData }) {
    // Verificação de segurança simples
    if (
        !analysisData ||
        !analysisData.timestamps ||
        !analysisData.reconstruction_errors
    ) {
        return (
            <p style={{ color: "red" }}>
                Erro: Dados recebidos para o gráfico estão incompletos.
            </p>
        );
    }

    try {
        const chartData = analysisData.timestamps.map((ts, index) => ({
            name: index,
            timestamp: ts,
            erro: analysisData.reconstruction_errors[index],
            limiar: analysisData.threshold,
        }));

        return (
            <div style={{ width: "100%", marginTop: "15px" }}>
                {/* Dê a altura (height) DIRETAMENTE para o ResponsiveContainer */}
                               {" "}
                <ResponsiveContainer width="100%" height={400}>
                                       {" "}
                    <LineChart
                        data={chartData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="name"
                            label={{
                                value: "Janela de Tempo (Índice)",
                                position: "insideBottom",
                                offset: -10,
                            }}
                        />
                        <YAxis
                            domain={["auto", "auto"]}
                            label={{
                                value: "Erro (MAE)",
                                angle: -90,
                                position: "insideLeft",
                            }}
                            tickFormatter={(tick) =>
                                typeof tick === "number"
                                    ? tick.toFixed(4)
                                    : tick
                            }
                        />
                        <Tooltip
                            labelFormatter={(label) => `Janela ${label}`}
                            formatter={(value, name) => [
                                typeof value === "number"
                                    ? value.toFixed(6)
                                    : value,
                                name === "erro"
                                    ? "Erro"
                                    : name === "limiar"
                                    ? "Limiar"
                                    : name,
                            ]}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="erro"
                            name="Erro de Reconstrução"
                            stroke="#8884d8"
                            strokeWidth={2}
                            dot={false}
                        />

                        {/* Renderiza a linha do limiar APENAS se a chave existir */}
                        {analysisData.threshold !== undefined && (
                            <Line
                                type="monotone"
                                dataKey="limiar"
                                name="Limiar"
                                stroke="#ff0000"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        );
    } catch (e) {
        console.error("AnomalyChart: Erro ao mapear dados do gráfico:", e);
        return (
            <p style={{ color: "red" }}>
                Erro ao processar dados para o gráfico: {e.message}
            </p>
        );
    }
}

export default AnomalyChart;
