package com.idh.industrial_data_hub.repository;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.idh.industrial_data_hub.model.DataSource;

@Repository 
public interface DataSourceRepository extends JpaRepository<DataSource, Long> {

    Optional<DataSource> findByName(String name);

    boolean existsByName(String name);

}