package com.idh.industrial_data_hub.repository;

import com.idh.industrial_data_hub.model.AnalysisResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AnalysisResultRepository extends JpaRepository<AnalysisResult, Long> {

    // --- Métodos de Consulta Personalizados ---

    // Este método será crucial para o frontend.
    // Ele encontrará o *último* (mais recente) resultado de análise
    // para um dataSourceId específico.
    Optional<AnalysisResult> findFirstByDataSourceIdOrderByCreatedAtDesc(Long dataSourceId);

    // (Opcional) Encontrar todos os resultados de uma fonte
    // List<AnalysisResult> findByDataSourceIdOrderByCreatedAtDesc(Long dataSourceId);

}