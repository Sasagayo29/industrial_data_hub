// Arquivo: frontend/idh-dashboard/src/components/RulChart.jsx
// (ESTE É O ARQUIVO QUE ESTÁ FALTANDO - CRIE-O)

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

function RulChart({ analysisData }) {
    // Verificação de segurança para dados de RUL
    if (
        !analysisData ||
        !analysisData.cycles ||
        !analysisData.rul_predictions
    ) {
        return (
            <p style={{ color: "red" }}>
                Erro: Dados recebidos para o gráfico de RUL estão incompletos.
            </p>
        );
    }

    try {
        // Mapeia os dados para o formato do Recharts
        const chartData = analysisData.cycles.map((cycle, index) => ({
            cycle: cycle,
            rul: analysisData.rul_predictions[index],
        }));

        return (
            <div style={{ width: "100%", marginTop: "15px" }}>
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart
                        data={chartData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="cycle"
                            label={{
                                value: "Ciclo do Motor",
                                position: "insideBottom",
                                offset: -10,
                            }}
                        />
                        <YAxis
                            domain={["auto", "auto"]}
                            label={{
                                value: "RUL (Ciclos Restantes)",
                                angle: -90,
                                position: "insideLeft",
                            }}
                            tickFormatter={(tick) =>
                                typeof tick === "number"
                                    ? tick.toFixed(0)
                                    : tick
                            }
                        />
                        <Tooltip
                            labelFormatter={(label) => `Ciclo ${label}`}
                            formatter={(value, name) => [
                                typeof value === "number"
                                    ? value.toFixed(2)
                                    : value,
                                "RUL Previsto",
                            ]}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="rul"
                            name="RUL Previsto"
                            stroke="#0088FE" // Cor azul
                            strokeWidth={2}
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        );
    } catch (e) {
        console.error("RulChart: Erro ao mapear dados do gráfico:", e);
        return (
            <p style={{ color: "red" }}>
                Erro ao processar dados para o gráfico: {e.message}
            </p>
        );
    }
}

export default RulChart;
