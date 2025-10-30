package com.idh.industrial_data_hub.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

@Entity
@Table(name = "analysis_results")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnalysisResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "data_source_id", nullable = false)
    private Long dataSourceId;

    @Column(nullable = false, length = 100)
    private String analysisType;

    @Column(nullable = false, length = 50)
    private String status; 

    @Lob
    @Column(columnDefinition = "TEXT")
    private String resultSummary;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String errorMessage;

    // --- GARANTA QUE ESTA SEÇÃO ESTÁ PRESENTE ---
    @Lob
    @Column(name = "result_details_json", columnDefinition = "JSON")
    private String resultDetailsJson;
    // --- FIM DA SEÇÃO ---

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}