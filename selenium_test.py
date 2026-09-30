from selenium import webdriver
from selenium.webdriver.common.by import By
import time

driver = webdriver.Chrome()
try:
    driver.get('http://localhost:3000/login.html')
    driver.maximize_window()
    time.sleep(2)
    print('================================')
    print('ALUMNI MENTORSHIP SELENIUM TEST')
    print('================================')
    print('\nTest Case 1: Interface Testing')
    name = driver.find_element(By.ID, 'login_name')
    assert name.is_displayed(), 'Name field is not displayed'
    password = driver.find_element(By.ID, 'login_pass')
    assert password.is_displayed(), 'Password field is not displayed'
    login_button = driver.find_element(By.XPATH, "//button[contains(text(),'Login')]")
    assert login_button.is_displayed(), 'Login button is not displayed'
    print('Interface Test Passed')
    print('\nTest Case 2: Usability Testing')
    assert name.get_attribute('placeholder') == 'Name'
    assert password.get_attribute('placeholder') == 'Password'
    assert 'Login' in login_button.text
    print('Usability Test Passed')
    print('\nTest Case 3: Register Navigation')
    register_link = driver.find_element(By.LINK_TEXT, 'Register here')
    assert register_link.is_displayed(), 'Register link is not displayed'
    register_link.click()
    time.sleep(1)
    assert 'register.html' in driver.current_url
    print('Register Navigation Passed')
    print('\nTest Case 4: Login Page Navigation')
    driver.get('http://localhost:3000/login.html')
    time.sleep(1)
    assert 'login.html' in driver.current_url
    print('Login Page Navigation Passed')
    print('\nAll Selenium tests completed')
finally:
    driver.quit()
