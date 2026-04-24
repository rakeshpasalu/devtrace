package com.example.demo.repository;

import com.example.demo.domain.OrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OrderRepository extends JpaRepository<OrderEntity, Long> {
    @Query("select o from OrderEntity o where o.status = :status")
    List<OrderEntity> findByStatus(@Param("status") String status);
}

