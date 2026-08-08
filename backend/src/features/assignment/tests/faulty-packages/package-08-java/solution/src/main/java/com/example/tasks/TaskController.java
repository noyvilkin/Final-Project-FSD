package com.example.tasks;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TaskController {

    // NOTE: tasks are stored only in this in-memory map. There is no database
    // and no persistence layer, so all data is lost when the process restarts.
    private final Map<Long, Task> store = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong(0);

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/tasks")
    public List<Task> list() {
        return new ArrayList<>(store.values());
    }

    @PostMapping("/tasks")
    public Task create(@RequestBody Task task) {
        long id = sequence.incrementAndGet();
        task.setId(id);
        store.put(id, task);
        return task;
    }

    @PutMapping("/tasks/{id}")
    public ResponseEntity<Task> update(@PathVariable Long id, @RequestBody Task update) {
        Task existing = store.get(id);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }
        existing.setTitle(update.getTitle());
        existing.setDone(update.isDone());
        return ResponseEntity.ok(existing);
    }

    @DeleteMapping("/tasks/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        store.remove(id);
        return ResponseEntity.noContent().build();
    }
}
