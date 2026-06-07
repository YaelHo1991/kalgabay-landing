<?php
require_once __DIR__ . '/../config.php';

session_destroy();
redirect(ADMIN_URL . '/login.php');
