.PHONY: help build up down restart logs shell clean rebuild

# 默认目标
help:
	@echo "Flovart Docker 管理命令"
	@echo ""
	@echo "使用方法: make [命令]"
	@echo ""
	@echo "可用命令:"
	@echo "  make build       - 构建 Docker 镜像"
	@echo "  make up          - 启动容器（后台运行）"
	@echo "  make down        - 停止并删除容器"
	@echo "  make restart     - 重启容器"
	@echo "  make logs        - 查看实时日志"
	@echo "  make shell       - 进入容器 Shell"
	@echo "  make clean       - 清理所有容器和镜像"
	@echo "  make rebuild     - 重新构建并启动（无缓存）"
	@echo "  make status      - 查看容器状态"
	@echo "  make stats       - 查看资源使用情况"
	@echo ""

# 构建镜像
build:
	@echo "正在构建 Docker 镜像..."
	docker-compose build

# 启动容器
up:
	@echo "正在启动容器..."
	docker-compose up -d
	@echo "容器已启动！访问 http://localhost:3217"

# 停止容器
down:
	@echo "正在停止容器..."
	docker-compose down

# 重启容器
restart:
	@echo "正在重启容器..."
	docker-compose restart

# 查看日志
logs:
	@echo "查看容器日志（按 Ctrl+C 退出）..."
	docker-compose logs -f

# 进入容器
shell:
	@echo "进入容器 Shell..."
	docker-compose exec making-app sh

# 清理资源
clean:
	@echo "正在清理 Docker 资源..."
	docker-compose down -v
	docker system prune -f
	@echo "清理完成！"

# 重新构建（无缓存）
rebuild:
	@echo "正在重新构建（无缓存）..."
	docker-compose build --no-cache
	docker-compose up -d
	@echo "重新构建完成！访问 http://localhost:3217"

# 查看状态
status:
	@echo "容器状态:"
	docker-compose ps

# 查看资源使用
stats:
	@echo "资源使用情况（按 Ctrl+C 退出）:"
	docker stats making-app


