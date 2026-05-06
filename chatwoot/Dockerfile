FROM chatwoot/chatwoot:v3.11.0

USER root
WORKDIR /app

# O bundle path real desta imagem é /gems, não /usr/local/bundle
ENV BUNDLE_PATH=/gems
ENV GEM_HOME=/gems

# devise-secure_password é referenciado por initializers do ChatWoot mas
# foi removido do Gemfile no v3.11.0 — adicionamos e instalamos aqui.
RUN bundle add devise-secure_password && \
    bundle install
