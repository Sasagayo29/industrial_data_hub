package com.idh.industrial_data_hub.controller;

// Importar os novos Model e Repository
import com.idh.industrial_data_hub.model.AnalysisResult;
import com.idh.industrial_data_hub.model.DataSource;
import com.idh.industrial_data_hub.repository.AnalysisResultRepository;
import com.idh.industrial_data_hub.repository.DataSourceRepository;
import com.idh.industrial_data_hub.config.RabbitMQConfig;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/datasources") // Caminho base para todos os endpoints
public class DataSourceController {

    @Autowired
    private DataSourceRepository dataSourceRepository;

    // Injetar o novo repositório
    @Autowired
    private AnalysisResultRepository analysisResultRepository;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    private final Path rootUploadDir = Paths.get("uploads");

    public DataSourceController() {
        try {
            Files.createDirectories(rootUploadDir);
            System.out.println("Diretório de uploads verificado/criado em: " + rootUploadDir.toAbsolutePath());
        } catch (IOException e) {
            System.err.println("Não foi possível criar o diretório de uploads! " + e.getMessage());
        }
    }

    // --- Endpoints de DataSource (CRUD) ---

    @GetMapping
    public ResponseEntity<List<DataSource>> getAllDataSources() {
        // ... (código igual ao anterior)
        try {
            List<DataSource> sources = dataSourceRepository.findAll();
            if (sources.isEmpty()) {
                return new ResponseEntity<>(HttpStatus.NO_CONTENT);
            }
            return new ResponseEntity<>(sources, HttpStatus.OK);
        } catch (Exception e) {
            System.err.println("Erro ao buscar todas DataSources: " + e.getMessage());
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<DataSource> getDataSourceById(@PathVariable("id") Long id) {
        // ... (código igual ao anterior, mas com sintaxe 'map' mais limpa)
        return dataSourceRepository.findById(id)
                .map(dataSource -> new ResponseEntity<>(dataSource, HttpStatus.OK))
                .orElse(new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }

    @PostMapping
    public ResponseEntity<DataSource> createDataSource(@RequestBody DataSource dataSource) {
        // ... (código igual ao anterior)
        try {
            if (dataSourceRepository.existsByName(dataSource.getName())) {
                return new ResponseEntity<>(HttpStatus.CONFLICT);
            }
            DataSource newDataSource = new DataSource(
                null, dataSource.getName(), dataSource.getSourceType(),
                dataSource.getLocation(), dataSource.getDescription(),
                null, null
            );
            DataSource savedDataSource = dataSourceRepository.save(newDataSource);
            return new ResponseEntity<>(savedDataSource, HttpStatus.CREATED);
        } catch (Exception e) {
            System.err.println("Erro ao criar DataSource: " + e.getMessage());
            return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PostMapping("/{id}/upload")
    public ResponseEntity<DataSource> uploadFile(@PathVariable("id") Long id, @RequestParam("file") MultipartFile file) {
        // ... (código igual ao anterior)
        Optional<DataSource> dataSourceOptional = dataSourceRepository.findById(id);
        if (!dataSourceOptional.isPresent()) {
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
        if (file.isEmpty()) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }
        try {
            String originalFilename = StringUtils.cleanPath(file.getOriginalFilename());
            String filename = "source_" + id + "_" + originalFilename;
            Path destinationPath = this.rootUploadDir.resolve(filename).normalize();
            Files.copy(file.getInputStream(), destinationPath, StandardCopyOption.REPLACE_EXISTING);
            System.out.println("Arquivo salvo em: " + destinationPath);

            DataSource dataSource = dataSourceOptional.get();
            dataSource.setLocation(rootUploadDir.getFileName().toString() + "/" + filename);
            DataSource updatedDataSource = dataSourceRepository.save(dataSource);
            return new ResponseEntity<>(updatedDataSource, HttpStatus.OK);
        } catch (IOException e) {
            System.err.println("Erro ao salvar arquivo para DataSource ID " + id + ": " + e.getMessage());
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // --- Endpoints de Análise ---

    /**
     * MODIFICADO: Dispara uma análise.
     * Agora cria um registro 'AnalysisResult' com status 'PENDING'
     * e envia o ID desse registro (jobId) para a fila do RabbitMQ.
     */
    @PostMapping("/{id}/analyze")
    public ResponseEntity<AnalysisResult> triggerAnalysis(@PathVariable("id") Long id) {
        // 1. Buscar a DataSource
        Optional<DataSource> dataSourceOptional = dataSourceRepository.findById(id);
        if (!dataSourceOptional.isPresent()) {
            // Não podemos retornar ResponseEntity<AnalysisResult> e <String>,
            // então vamos lidar com isso criando um objeto de erro
            // ou simplesmente retornando 404
            return new ResponseEntity<>(HttpStatus.NOT_FOUND);
        }
        DataSource dataSource = dataSourceOptional.get();

        // 2. Verificar se há um local de arquivo
        if (dataSource.getLocation() == null || dataSource.getLocation().isEmpty()) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST); // Não há arquivo para analisar
        }
        
        // 3. (NOVO) Criar o registro da Análise com status "PENDING"
        AnalysisResult newJob = AnalysisResult.builder() // Usando o @Builder do Lombok
                .dataSourceId(dataSource.getId())
                .analysisType("ANOMALY_DETECTION") // Por enquanto fixo
                .status("PENDING")
                .build();
        
        AnalysisResult savedJob = analysisResultRepository.save(newJob);

        // 4. (MODIFICADO) Criar a mensagem para enviar à fila
        // AGORA INCLUINDO O ID DO JOB (analysisResultId)
        Map<String, Object> message = Map.of(
            "analysisResultId", savedJob.getId(),
            "dataSourceId", dataSource.getId(),
            "filePath", dataSource.getLocation(),
            "analysisType", dataSource.getSourceType()
        );
        try {
            // 5. Enviar a mensagem para a fila
            rabbitTemplate.convertAndSend(RabbitMQConfig.ANALYSIS_QUEUE_NAME, message);
            System.out.println("Mensagem de análise (Job ID: " + savedJob.getId() + ") enviada para a fila.");

            // 6. Retornar 202 Accepted com o objeto do job PENDENTE
            return new ResponseEntity<>(savedJob, HttpStatus.ACCEPTED);

        } catch (Exception e) {
            System.err.println("Erro ao enviar mensagem para RabbitMQ: " + e.getMessage());
            // Se falhar ao enviar para o RabbitMQ, devemos reverter o job (FAILED)?
            savedJob.setStatus("FAILED");
            savedJob.setErrorMessage("Falha ao enfileirar no RabbitMQ: " + e.getMessage());
            analysisResultRepository.save(savedJob);
            return new ResponseEntity<>(savedJob, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * NOVO: Busca o resultado de análise MAIS RECENTE para uma fonte de dados.
     * O frontend usará isso para "sondar" (poll) o status.
     */
    @GetMapping("/analysis/latest/{dataSourceId}")
    public ResponseEntity<AnalysisResult> getLatestAnalysisResult(@PathVariable Long dataSourceId) {
        
        // Usando o método mágico que criamos no repositório
        Optional<AnalysisResult> result = analysisResultRepository.findFirstByDataSourceIdOrderByCreatedAtDesc(dataSourceId);

        // Se encontrou, retorna 200 OK com o resultado.
        // Se não encontrou (nenhuma análise foi disparada), retorna 404 Not Found.
        return result.map(res -> new ResponseEntity<>(res, HttpStatus.OK))
                     .orElseGet(() -> new ResponseEntity<>(HttpStatus.NOT_FOUND));
    }
}